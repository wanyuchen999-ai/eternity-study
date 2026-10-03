import { useState } from 'react'
import { listUsers, createProfile, enterProfile, renameProfile, deleteProfile, sanitizeName, enterCloudProfile, type ProfileUser } from '../lib/profileStorage'
import { cloudEnabled } from '../lib/cloudConfig'
import { cloudSignUp, cloudSignIn } from '../lib/cloud'
import { toast } from '../store/ui'

const EMOJIS = ['🌟', '🐱', '🚀', '📚', '🌸', '🐼', '🦊', '🍀', '⚡', '🎵']

/* ---------- 本地离线模式（数据只存本机） ---------- */

function LocalGate() {
  const [users, setUsers] = useState<ProfileUser[]>(() => listUsers())
  const [mode, setMode] = useState<'list' | 'create' | 'manage'>('list')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [editing, setEditing] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const doCreate = () => {
    try {
      createProfile(name, emoji)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    }
  }

  const doRename = (oldName: string) => {
    try {
      renameProfile(oldName, newName)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    }
  }

  const doDelete = (n: string) => {
    if (!confirm(`删除「${n}」的全部数据？此操作不可恢复！`)) return
    deleteProfile(n)
    setUsers(listUsers())
  }

  return (
    <>
      {mode === 'list' && (
        <>
          <div className="gate-list">
            {users.length === 0 && <div className="field-hint" style={{ textAlign: 'center' }}>还没有本地用户，先创建一个吧</div>}
            {users.map((u) => (
              <button key={u.name} className="gate-user" onClick={() => enterProfile(u.name)}>
                <span className="gate-emoji">{u.emoji}</span>
                <span className="gate-name">{u.name}</span>
                <span className="field-hint">进入 →</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary btn-md" onClick={() => setMode('create')}>
              <span>＋ 新建本地用户</span>
            </button>
            {users.length > 0 && (
              <button className="btn btn-ghost btn-md" onClick={() => setMode('manage')}>
                <span>管理</span>
              </button>
            )}
          </div>
        </>
      )}

      {mode === 'create' && (
        <>
          <div className="gate-form">
            <div className="field">
              <span className="field-label">你的名字（同学/昵称都行）</span>
              <input className="input" autoFocus maxLength={16} placeholder="如：小明" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <span className="field-label">选一个头像</span>
              <div className="gate-emojis">
                {EMOJIS.map((e) => (
                  <button key={e} className={`gate-emoji-btn ${emoji === e ? 'active' : ''}`} onClick={() => setEmoji(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary btn-md" onClick={doCreate} disabled={!name.trim()}>创建并进入</button>
            <button className="btn btn-ghost btn-md" onClick={() => setMode('list')}>返回</button>
          </div>
        </>
      )}

      {mode === 'manage' && (
        <>
          <div className="gate-list">
            {users.map((u) => (
              <div key={u.name} className="gate-user manage">
                {editing === u.name ? (
                  <>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      autoFocus
                      value={newName}
                      maxLength={16}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newName.trim()) doRename(u.name)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                    <button className="btn btn-soft btn-sm" onClick={() => doRename(u.name)} disabled={!newName.trim() || sanitizeName(newName) === u.name}>保存</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>取消</button>
                  </>
                ) : (
                  <>
                    <span className="gate-emoji">{u.emoji}</span>
                    <span className="gate-name">{u.name}</span>
                    <button className="btn btn-soft btn-sm" onClick={() => { setEditing(u.name); setNewName(u.name) }}>改名</button>
                    <button className="btn btn-danger btn-sm" onClick={() => doDelete(u.name)}>删除</button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-ghost btn-md" onClick={() => setMode('list')}>返回</button>
          </div>
        </>
      )}
      <div className="field-hint" style={{ textAlign: 'center', marginTop: 16 }}>
        离线模式的数据只保存在这台设备的浏览器里，不联网、不云同步。
      </div>
    </>
  )
}

/* ---------- 云端账号（注册即用，换设备登录同步） ---------- */

function CloudGate({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [busy, setBusy] = useState<'in' | 'up' | null>(null)
  const [err, setErr] = useState('')

  const enter = () => {
    enterCloudProfile()
  }

  const doIn = async () => {
    setErr('')
    setBusy('in')
    try {
      await cloudSignIn(email.trim(), pwd)
      enter()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const doUp = async () => {
    setErr('')
    setBusy('up')
    try {
      const { needConfirm } = await cloudSignUp(email.trim(), pwd)
      if (needConfirm) {
        toast('注册成功！请先去邮箱点确认邮件，再回来登录', 'ok')
        setErr('已发送确认邮件：去邮箱点一下确认链接，然后回来登录（站长可在 Supabase 后台关闭邮箱确认）')
      } else {
        enter()
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const canGo = /.+@.+\..+/.test(email) && pwd.length >= 6

  return (
    <>
      <div className="gate-form">
        <div className="field">
          <span className="field-label">邮箱</span>
          <input className="input" autoFocus type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canGo && !busy && doIn()} />
        </div>
        <div className="field">
          <span className="field-label">密码（至少 6 位）</span>
          <input className="input" type="password" placeholder="••••••" value={pwd} onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canGo && !busy && doIn()} />
        </div>
        {err && <div className="ai-warn" style={{ marginTop: 8 }}>{err}</div>}
      </div>
      <div className="row" style={{ gap: 10, justifyContent: 'center' }}>
        <button className="btn btn-primary btn-md" onClick={doIn} disabled={!canGo || busy !== null}>{busy === 'in' ? '登录中…' : '登录'}</button>
        <button className="btn btn-soft btn-md" onClick={doUp} disabled={!canGo || busy !== null}>{busy === 'up' ? '注册中…' : '注册新账号'}</button>
      </div>
      <div className="field-hint" style={{ textAlign: 'center', marginTop: 14 }}>
        注册/登录后：任务、笔记、单词进度自动云端保存，换设备登录同一个账号即可接着学。
      </div>
      <button className="btn btn-ghost btn-sm" style={{ margin: '14px auto 0', display: 'block' }} onClick={onBack}>返回</button>
    </>
  )
}

export default function ProfileGate() {
  const [tab, setTab] = useState<'cloud' | 'local'>(cloudEnabled() ? 'cloud' : 'local')
  const [cloudView, setCloudView] = useState<'main' | 'cloud'>('main')

  if (cloudEnabled() && cloudView === 'cloud') {
    return (
      <div className="gate-wrap">
        <div className="gate-card">
          <div className="gate-logo">
            <span className="logo-mark">E</span>
            <span>Eternity 学习台</span>
          </div>
          <div className="gate-sub">登录你的账号，学习进度云端保存</div>
          <CloudGate onBack={() => setCloudView('main')} />
        </div>
      </div>
    )
  }

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        <div className="gate-logo">
          <span className="logo-mark">E</span>
          <span>Eternity 学习台</span>
        </div>
        <div className="gate-sub">每个人一个自己的学习空间</div>

        {cloudEnabled() && (
          <div className="row" style={{ justifyContent: 'center', marginBottom: 18 }}>
            <button className={`chip ${tab === 'cloud' ? 'active' : ''}`} onClick={() => setTab('cloud')}>云端账号</button>
            <button className={`chip ${tab === 'local' ? 'active' : ''}`} onClick={() => setTab('local')}>离线模式</button>
          </div>
        )}

        {tab === 'cloud' && cloudEnabled() ? (
          <div>
            <button className="gate-user" onClick={() => enterCloudProfile()}>
              <span className="gate-emoji">☁️</span>
              <span className="gate-name">注册 / 登录云端账号</span>
              <span className="field-hint">进入 →</span>
            </button>
            <div className="field-hint" style={{ textAlign: 'center', margin: '12px 0 16px' }}>
              邮箱注册，进度云保存，换设备登录不丢
            </div>
            <button className="btn btn-ghost btn-md" style={{ margin: '0 auto', display: 'block' }} onClick={() => setCloudView('cloud')}>已有账号？去登录</button>
            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn btn-ghost btn-sm" style={{ margin: '0 auto' }} onClick={() => setTab('local')}>先用离线模式（数据仅存本机）</button>
            </div>
          </div>
        ) : (
          <LocalGate />
        )}
      </div>
    </div>
  )
}

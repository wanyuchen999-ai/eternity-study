import { useState } from 'react'
import { listUsers, createProfile, enterProfile, renameProfile, deleteProfile, sanitizeName, type ProfileUser } from '../lib/profileStorage'
import { toast } from '../store/ui'

const EMOJIS = ['🌟', '🐱', '🚀', '📚', '🌸', '🐼', '🦊', '🍀', '⚡', '🎵']

export default function ProfileGate() {
  const [users, setUsers] = useState<ProfileUser[]>(() => listUsers())
  const [mode, setMode] = useState<'list' | 'create' | 'manage'>('list')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [editing, setEditing] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const doCreate = () => {
    try {
      createProfile(name, emoji) // 成功后自动刷新进入新档案
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
    <div className="gate-wrap">
      <div className="gate-card">
        <div className="gate-logo">
          <span className="logo-mark">E</span>
          <span>Eternity 学习台</span>
        </div>
        <div className="gate-sub">每个人一个自己的学习空间 · 数据只存在这台设备的浏览器里</div>

        {mode === 'list' && (
          <>
            <div className="gate-list">
              {users.length === 0 && <div className="field-hint" style={{ textAlign: 'center' }}>还没有用户，先创建一个吧</div>}
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
                <span>＋ 新建用户</span>
              </button>
              {users.length > 0 && (
                <button className="btn btn-ghost btn-md" onClick={() => setMode('manage')}>
                  <span>管理用户</span>
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

        <div className="field-hint" style={{ textAlign: 'center', marginTop: 18 }}>
          每个用户的数据互相独立；AI 密钥也是各自在「设置」里填写自己的。
        </div>
      </div>
    </div>
  )
}

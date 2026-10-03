import { useState, useEffect, type CSSProperties } from 'react'
import { Card, Button, Field, Tag } from '../components/ui'
import { useSettings, type AISettings } from '../store/settings'
import { chat } from '../lib/ai'
import { toast } from '../store/ui'
import { download } from '../lib/util'
import { exportMyData, importMyData, clearMyData, getCurrentUser, exitProfile } from '../lib/profileStorage'
import { cloudEnabled } from '../lib/cloudConfig'
import { getCloudUser, pushCloud, cloudSignOut, lastSyncedAt } from '../lib/cloud'

const THEMES: { id: string; name: string; a: string; b: string }[] = [
  { id: 'indigo', name: '默认靛蓝', a: '#6366f1', b: '#8b5cf6' },
  { id: 'pink', name: '樱花粉', a: '#ec4899', b: '#f472b6' },
  { id: 'blue', name: '天空蓝', a: '#3b82f6', b: '#60a5fa' },
  { id: 'green', name: '薄荷绿', a: '#10b981', b: '#34d399' },
  { id: 'purple', name: '葡萄紫', a: '#8b5cf6', b: '#a78bfa' },
  { id: 'orange', name: '蜜桃橙', a: '#f97316', b: '#fb923c' },
  { id: 'mono', name: '极简黑白', a: '#334155', b: '#94a3b8' },
]

const PROVIDERS: { name: string; ai: Partial<AISettings> }[] = [
  { name: '智谱 AI（有免费模型）', ai: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', chatModel: 'glm-4-flash', visionModel: 'glm-4v-flash', asrModel: 'glm-asr' } },
  { name: 'DeepSeek', ai: { baseUrl: 'https://api.deepseek.com/v1', chatModel: 'deepseek-chat' } },
  { name: 'Kimi 月之暗面', ai: { baseUrl: 'https://api.moonshot.cn/v1', chatModel: 'moonshot-v1-8k' } },
  { name: '阿里通义千问', ai: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', chatModel: 'qwen-plus', visionModel: 'qwen-vl-plus' } },
  { name: '硅基流动', ai: { baseUrl: 'https://api.siliconflow.cn/v1', chatModel: 'Qwen/Qwen2.5-7B-Instruct', visionModel: 'Qwen/Qwen2-VL-7B-Instruct' } },
  { name: 'OpenAI', ai: { baseUrl: 'https://api.openai.com/v1', chatModel: 'gpt-4o-mini', visionModel: 'gpt-4o-mini', asrModel: 'whisper-1' } },
  { name: '本地演示（假 AI）', ai: { baseUrl: 'http://localhost:5179/v1', apiKey: 'demo', chatModel: 'demo', visionModel: 'demo', asrModel: 'demo' } },
]

export default function SettingsPage() {
  const s = useSettings()
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [cloudAcc, setCloudAcc] = useState<{ id: string; email: string } | null>(null)
  const [syncAt, setSyncAt] = useState(() => lastSyncedAt())
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!cloudEnabled()) return
    getCloudUser().then(setCloudAcc)
  }, [])

  const doSync = async () => {
    if (!cloudAcc) return
    setSyncing(true)
    try {
      await pushCloud(cloudAcc.id)
      setSyncAt(lastSyncedAt())
      toast('已同步到云端 ☁️', 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setSyncing(false)
    }
  }

  const doLogout = async () => {
    if (!confirm('退出云端账号？本机缓存的数据会保留，下次登录同账号可继续。')) return
    try {
      await cloudSignOut()
    } catch {
      /* 忽略 */
    }
    exitProfile()
  }

  const test = async () => {
    setTesting(true)
    try {
      await chat([{ role: 'user', content: '回复“连接成功”四个字' }], { maxTokens: 20, temperature: 0 })
      toast('✅ 连接成功，AI 可以使用了', 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setTesting(false)
    }
  }

  const exportData = () => {
    const data = exportMyData()
    download(`eternity-backup-${getCurrentUser()?.name ?? 'user'}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'eternity-study', date: Date.now(), data }, null, 2))
    toast('已导出当前用户的全部数据（含 AI 配置）', 'ok')
  }

  const importData = async (f: File | undefined) => {
    if (!f) return
    try {
      const obj = JSON.parse(await f.text())
      importMyData(obj?.data ?? {})
      toast('已导入数据，即将刷新页面', 'ok')
      setTimeout(() => location.reload(), 800)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    }
  }

  return (
    <div>
      <h1 className="page-title">设置</h1>
      <p className="page-sub">主题外观 · AI 配置 · 计时偏好 · 数据管理</p>

      <Card className="mt16" title="主题外观" extra={<Tag color="gray">白色基底 + 马卡龙主题色，点击即换</Tag>}>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-swatch ${s.theme === t.id ? 'active' : ''}`}
              onClick={() => { s.set({ theme: t.id }); toast(`已切换为「${t.name}」主题`, 'ok') }}
            >
              <span className="theme-dot" style={{ '--sa': t.a, '--sb': t.b } as CSSProperties} />
              <span className="theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt16" title="AI 服务配置" extra={<Tag color={s.ai.apiKey ? 'green' : 'gray'}>{s.ai.apiKey ? '已配置' : '未配置'}</Tag>}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="field-hint">一键填入常用服务商：</span>
          {PROVIDERS.map((p) => (
            <button key={p.name} className="chip" onClick={() => { s.setAI(p.ai); toast(`已切换为 ${p.name} 的推荐配置（记得填密钥）`, 'ok') }}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="grid2">
          <Field label="API 地址（OpenAI 兼容）" hint="一般以 /v1、/v4 结尾，不要带 /chat/completions">
            <input className="input" value={s.ai.baseUrl} onChange={(e) => s.setAI({ baseUrl: e.target.value })} />
          </Field>
          <Field label="API 密钥" hint="只在你的浏览器本地保存，不会上传">
            <div className="row" style={{ gap: 8 }}>
              <input className="input" type={showKey ? 'text' : 'password'} value={s.ai.apiKey} onChange={(e) => s.setAI({ apiKey: e.target.value.trim() })} placeholder="sk-…" />
              <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</Button>
            </div>
          </Field>
        </div>
        <div className="grid3 mt12">
          <Field label="对话模型" hint="归纳、对话、解析题目">
            <input className="input" value={s.ai.chatModel} onChange={(e) => s.setAI({ chatModel: e.target.value })} />
          </Field>
          <Field label="视觉模型" hint="图片录题用，需支持看图">
            <input className="input" value={s.ai.visionModel} onChange={(e) => s.setAI({ visionModel: e.target.value })} />
          </Field>
          <Field label="语音转写模型" hint="课堂录音转文字">
            <input className="input" value={s.ai.asrModel} onChange={(e) => s.setAI({ asrModel: e.target.value })} />
          </Field>
        </div>
        <div className="mt12">
          <Button icon="zap" onClick={test} disabled={testing || !s.ai.apiKey}>{testing ? '测试中…' : '测试连接'}</Button>
        </div>
        <div className="field-hint mt12">
          智谱注册即送额度且 glm-4-flash / glm-4v-flash 免费，适合学生；任何 OpenAI 兼容服务都可用。若浏览器控制台出现 CORS 报错，说明该服务商不允许网页直连，请更换服务商。
        </div>
      </Card>

      {cloudEnabled() && (
        <Card className="mt16" title="云同步账号" extra={<Tag color={cloudAcc ? 'green' : 'gray'}>{cloudAcc ? '已登录' : '未登录'}</Tag>}>
          {cloudAcc ? (
            <>
              <div className="field-hint">当前账号：{cloudAcc.email}{syncAt ? ` · 上次同步：${new Date(syncAt).toLocaleString()}` : ''}</div>
              <div className="row mt12" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Button icon="download" onClick={doSync} disabled={syncing}>{syncing ? '同步中…' : '立即同步'}</Button>
                <Button variant="ghost" onClick={doLogout}>退出登录</Button>
                <span className="field-hint">改动后约 2 秒自动同步；换设备登录同账号即可接上进度</span>
              </div>
            </>
          ) : (
            <div className="field-hint">刷新页面在首页登录/注册云端账号后，进度将自动云保存。</div>
          )}
        </Card>
      )}

      <Card className="mt16" title="通用偏好">
        <div className="grid2">
          <Field label="你的昵称（首页问候用）">
            <input className="input" value={s.userName} onChange={(e) => s.set({ userName: e.target.value })} placeholder="如：同学" />
          </Field>
          <Field label="每日番茄目标（个）">
            <input className="input" type="number" min={1} max={20} value={s.pomo.dailyGoal} onChange={(e) => s.setPomo({ dailyGoal: Math.max(1, +e.target.value || 8) })} />
          </Field>
        </div>
        <div className="grid3 mt12">
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={s.pomo.autoNext} onChange={(e) => s.setPomo({ autoNext: e.target.checked })} />
            <span className="field-hint">番茄结束后自动开始下一段</span>
          </label>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={s.pomo.soundOn} onChange={(e) => s.setPomo({ soundOn: e.target.checked })} />
            <span className="field-hint">结束时播放提示音</span>
          </label>
          <Field label="每几轮后长休息">
            <input className="input" type="number" min={2} max={10} value={s.pomo.longEvery} onChange={(e) => s.setPomo({ longEvery: Math.max(2, +e.target.value || 4) })} />
          </Field>
        </div>
      </Card>

      <Card className="mt16" title="数据管理" >
        <div className="field-hint">所有数据保存在本浏览器（localStorage）。换设备/换浏览器前请先导出备份。</div>
        <div className="row mt12" style={{ gap: 10, flexWrap: 'wrap' }}>
          <Button icon="download" onClick={exportData}>导出全部数据</Button>
          <label className="btn btn-ghost btn-md">
            导入备份
            <input type="file" accept=".json" hidden onChange={(e) => importData(e.target.files?.[0])} />
          </label>
          <Button
            variant="danger"
            icon="trash"
            onClick={() => {
              if (!confirm(`清空「${getCurrentUser()?.name ?? '当前用户'}」的全部数据（笔记、词库进度、题库、番茄记录等）？此操作不可恢复！`)) return
              clearMyData()
            }}
          >
            清空我的数据
          </Button>
        </div>
      </Card>

      <Card className="mt16" title="关于">
        <div className="md-body">
          <p><strong>Eternity 学习台</strong> v0.1 —— 为学生做的本地优先学习工具：番茄钟 / 待办 / AI 学习台（录音整理、对话框架、笔记归纳）/ 背单词 / 智能录题刷题错题本 / 考试倒计时。</p>
          <p>纯前端应用，无需服务器；数据 100% 本地。AI 能力通过 OpenAI 兼容接口接入，密钥只存在你自己的浏览器里。</p>
        </div>
      </Card>
    </div>
  )
}

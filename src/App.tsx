import { useEffect, useState } from 'react'
import { Icon } from './components/Icon'
import { Toasts } from './components/ui'
import { useSettings } from './store/settings'
import { PomoEngineProvider } from './store/pomoEngine'
import { getCurrentUser, exitProfile, isCloudProfile } from './lib/profileStorage'
import { cloudEnabled } from './lib/cloudConfig'
import { getCloudUser, pullCloud, startAutoSync } from './lib/cloud'
import { toast } from './store/ui'
import Home from './modules/Home'
import Pomodoro from './modules/Pomodoro'
import Todos from './modules/Todos'
import AIStudio from './modules/AIStudio'
import Vocab from './modules/Vocab'
import Questions from './modules/Questions'
import SettingsPage from './modules/Settings'
import ProfileGate from './modules/ProfileGate'

const NAV = [
  { key: 'home', icon: 'home', label: '首页' },
  { key: 'pomodoro', icon: 'clock', label: '番茄钟' },
  { key: 'todos', icon: 'check', label: '待办' },
  { key: 'ai', icon: 'sparkles', label: 'AI 学习台' },
  { key: 'vocab', icon: 'book', label: '背单词' },
  { key: 'questions', icon: 'layers', label: '题库' },
]

function useHashRoute() {
  const parse = () => location.hash.replace(/^#\/?/, '') || 'home'
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => {
      setRoute(parse())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export default function App() {
  const user = getCurrentUser()
  const route = useHashRoute()
  const [drawer, setDrawer] = useState(false)
  const aiOk = !!useSettings((s) => s.ai.apiKey)
  const theme = useSettings((s) => s.theme)
  const [authState, setAuthState] = useState<'checking' | 'in' | 'out'>(() => {
    if (isCloudProfile()) return 'checking' // 云端模式需校验会话
    if (getCurrentUser()) return 'in' // 本地档案：直接进入，不受云端影响
    return cloudEnabled() ? 'checking' : 'out'
  })
  const [cloudUser, setCloudUser] = useState<{ id: string; email: string } | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme || 'indigo')
  }, [theme])

  // 云端判定：只在「未选择档案」或「显式处于云端模式」时执行
  useEffect(() => {
    if (!cloudEnabled()) return
    if (getCurrentUser() && !isCloudProfile()) return // 本地档案：直接进入
    let alive = true
    ;(async () => {
      try {
        const cu = await getCloudUser()
        if (!alive) return
        if (!cu || !isCloudProfile()) {
          // 无云端会话，或会话存在但用户未选择云端模式 → 显示选择页
          setAuthState('out')
          return
        }
        setCloudUser(cu)
        try {
          await pullCloud(cu.id)
        } catch {
          toast('云同步暂时不可用（网络问题），已加载本机缓存数据', 'err')
        }
        setAuthState('in')
      } catch (e) {
        if (!alive) return
        if (isCloudProfile()) {
          toast('云端连接失败，已加载本机缓存数据', 'err')
          setAuthState('in')
        } else {
          setAuthState('out')
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!cloudUser) return
    const uid = cloudUser.id
    return startAutoSync(() => uid)
  }, [cloudUser])

  if (authState === 'checking') {
    return (
      <div className="gate-wrap">
        <div className="gate-card">
          <div className="gate-logo">
            <span className="logo-mark">E</span>
            <span>Eternity 学习台</span>
          </div>
          <div className="gate-sub">正在恢复你的账号与学习进度…</div>
        </div>
      </div>
    )
  }

  if (authState === 'out' || (!user && !cloudUser)) {
    return (
      <PomoEngineProvider>
        <ProfileGate />
        <Toasts />
      </PomoEngineProvider>
    )
  }

  const nav = (k: string) => {
    location.hash = '#/' + k
    setDrawer(false)
  }

  const page =
    route === 'pomodoro' ? <Pomodoro /> :
    route === 'todos' ? <Todos /> :
    route === 'ai' ? <AIStudio /> :
    route === 'vocab' ? <Vocab /> :
    route === 'questions' ? <Questions /> :
    route === 'settings' ? <SettingsPage /> :
    <Home />

  return (
    <PomoEngineProvider>
      <div className="app">
        {drawer && <div className="mask" onClick={() => setDrawer(false)} />}
        <aside className={`sidebar ${drawer ? 'open' : ''}`}>
          <div className="logo">
            <span className="logo-mark">E</span>
            <span>Eternity 学习台</span>
          </div>
          <nav className="nav">
            {NAV.map((n) => (
              <button key={n.key} className={`nav-item ${route === n.key ? 'active' : ''}`} onClick={() => nav(n.key)}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            {cloudUser ? (
              <button className="user-chip" onClick={() => nav('settings')} title="云同步设置 / 退出登录">
                <span className="user-emoji">☁️</span>
                <span className="user-name">{cloudUser.email}</span>
                <span className="user-switch">账号</span>
              </button>
            ) : (
              <button className="user-chip" onClick={() => exitProfile()} title="切换 / 新建用户">
                <span className="user-emoji">{user?.emoji ?? '🌟'}</span>
                <span className="user-name">{user?.name ?? '本地用户'}</span>
                <span className="user-switch">切换</span>
              </button>
            )}
            <button className={`nav-item ${route === 'settings' ? 'active' : ''}`} onClick={() => nav('settings')}>
              <Icon name="settings" />
              <span>设置</span>
            </button>
            <button className="ai-status" onClick={() => nav('settings')} title="点击前往设置">
              <span className={`dot ${aiOk ? 'ok' : ''}`} />
              {aiOk ? 'AI 已就绪' : 'AI 未配置'}
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <button className="icon-btn" onClick={() => setDrawer(true)}>
              <Icon name="menu" size={20} />
            </button>
            <span className="topbar-title">Eternity 学习台</span>
          </header>
          <div className="content">{page}</div>
        </main>

        <Toasts />
      </div>
    </PomoEngineProvider>
  )
}

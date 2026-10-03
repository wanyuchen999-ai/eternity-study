import { createRoot } from 'react-dom/client'
import App from './App'
import { runSeed } from './seed'
import { getCurrentUser } from './lib/profileStorage'
import './styles.css'

// 已登录用户且该档案还没有初始化过 → 写入示例数据（词库/示例题/欢迎笔记）
if (getCurrentUser()) runSeed()

createRoot(document.getElementById('root')!).render(<App />)

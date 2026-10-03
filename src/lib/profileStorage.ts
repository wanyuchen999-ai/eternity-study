/**
 * 多用户档案：每个用户名一个独立的数据命名空间（localStorage 键前缀 u/<名字>/）。
 * 元数据 eternity-profile 不加前缀（全局共享）；其余 eternity-* 数据全部走 profileStorage。
 * 切换/新建用户后通过 location.reload() 让各 store 按新前缀重新加载。
 */

const META_KEY = 'eternity-profile'

export const STORE_NAMES = ['settings', 'pomodoro', 'todos', 'notes', 'vocab', 'questions', 'exams']

export type ProfileUser = { name: string; emoji: string }
export type ProfileMeta = { current: string; users: ProfileUser[] }

function readMeta(): ProfileMeta | null {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || 'null')
    if (m && typeof m.current === 'string' && Array.isArray(m.users)) return m
  } catch {
    /* 损坏则重建 */
  }
  return null
}

function writeMeta(m: ProfileMeta | null) {
  if (m) localStorage.setItem(META_KEY, JSON.stringify(m))
  else localStorage.removeItem(META_KEY)
}

export function sanitizeName(raw: string): string {
  const name = raw.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16)
  if (!name) throw new Error('用户名不能为空')
  return name
}

let prefix = ''
export const getPrefix = () => prefix

export function getCurrentUser(): ProfileUser | null {
  const m = readMeta()
  if (!m?.current) return null
  if (m.current === '@cloud') return { name: '云端账号', emoji: '☁️' }
  return m.users.find((u) => u.name === m.current) ?? { name: m.current, emoji: '🌟' }
}

export const isCloudProfile = () => readMeta()?.current === '@cloud'

/** 登录云端账号后切换到云端缓存命名空间 */
export function enterCloudProfile() {
  const m = readMeta() ?? { current: '', users: [] as ProfileUser[] }
  m.current = '@cloud'
  writeMeta(m)
  location.reload()
}

export function listUsers(): ProfileUser[] {
  return readMeta()?.users ?? []
}

// 启动：决定当前命名空间；首次升级时把旧的全局数据迁移进默认档案
;(function init() {
  let meta = readMeta()
  if (!meta) {
    const legacyStores = STORE_NAMES.filter((n) => localStorage.getItem('eternity-' + n) != null)
    if (legacyStores.length) {
      const name = '我的'
      for (const n of STORE_NAMES) {
        const k = 'eternity-' + n
        const v = localStorage.getItem(k)
        if (v != null) {
          localStorage.setItem(`u/${name}/${k}`, v)
          localStorage.removeItem(k)
        }
      }
      localStorage.setItem(`u/${name}/eternity-seeded`, '1')
      meta = { current: name, users: [{ name, emoji: '🌟' }] }
    } else {
      meta = { current: '', users: [] }
    }
    writeMeta(meta)
  }
  prefix = meta.current ? `u/${meta.current}/` : ''
})()

/** 带用户前缀的持久化存储（供 zustand persist 使用） */
export const profileStorage = {
  getItem: (name: string) => localStorage.getItem(prefix + name),
  setItem: (name: string, value: string) => localStorage.setItem(prefix + name, value),
  removeItem: (name: string) => localStorage.removeItem(prefix + name),
}

/* ---------- 用户管理 ---------- */

export function enterProfile(name: string) {
  const m = readMeta() ?? { current: '', users: [] as ProfileUser[] }
  m.current = name
  if (!m.users.some((u) => u.name === name)) m.users.push({ name, emoji: '🌟' })
  writeMeta(m)
  location.reload()
}

export function createProfile(rawName: string, emoji: string) {
  const name = sanitizeName(rawName)
  const m = readMeta() ?? { current: '', users: [] as ProfileUser[] }
  if (m.users.some((u) => u.name === name)) throw new Error('这个名字已经被用啦，换一个吧')
  m.users.push({ name, emoji })
  m.current = name
  writeMeta(m)
  location.reload() // 新档案没有 seeded 标记，启动时自动写入示例数据
}

export function exitProfile() {
  const m = readMeta()
  if (m) {
    m.current = ''
    writeMeta(m)
  }
  location.reload()
}

export function renameProfile(oldName: string, rawNew: string) {
  const newName = sanitizeName(rawNew)
  if (newName === oldName) return
  const m = readMeta()
  if (!m) return
  if (m.users.some((u) => u.name === newName)) throw new Error('这个名字已经被用啦')
  const oldP = `u/${oldName}/`
  const newP = `u/${newName}/`
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(oldP))
  for (const k of keys) {
    localStorage.setItem(newP + k.slice(oldP.length), localStorage.getItem(k) ?? '')
    localStorage.removeItem(k)
  }
  m.users = m.users.map((u) => (u.name === oldName ? { name: newName, emoji: u.emoji } : u))
  if (m.current === oldName) m.current = newName
  writeMeta(m)
  location.reload()
}

export function deleteProfile(name: string) {
  const m = readMeta()
  if (!m) return
  const p = `u/${name}/`
  for (const k of Object.keys(localStorage).filter((k) => k.startsWith(p))) localStorage.removeItem(k)
  m.users = m.users.filter((u) => u.name !== name)
  if (m.current === name) m.current = ''
  writeMeta(m)
  location.reload()
}

/* ---------- 当前用户的数据工具 ---------- */

export function clearMyData() {
  for (const k of Object.keys(localStorage).filter((k) => k.startsWith(prefix + 'eternity-'))) localStorage.removeItem(k)
  location.reload() // 重载后会重新写入示例数据
}

export function exportMyData(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(localStorage).filter((k) => k.startsWith(prefix + 'eternity-'))) {
    out[k] = localStorage.getItem(k) ?? ''
  }
  return out
}

export function importMyData(data: Record<string, string>) {
  let n = 0
  for (const [k, v] of Object.entries(data)) {
    const key = k.startsWith('eternity-') ? prefix + k : k
    if (key.startsWith(prefix + 'eternity-')) {
      localStorage.setItem(key, v)
      n++
    }
  }
  if (!n) throw new Error('备份文件里没有找到可导入的数据')
}

/**
 * 云端账号：注册 / 登录 / 整包同步。
 * 数据模型：user_data 表一行对应一个账号，payload 存该账号的全部学习数据。
 * 本地缓存仍走 profileStorage（前缀 u/@cloud/），登录后先展示缓存，再与云端对齐。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, cloudEnabled } from './cloudConfig'
import { useSettings } from '../store/settings'
import { usePomodoro } from '../store/pomodoro'
import { useTodos } from '../store/todos'
import { useNotes } from '../store/notes'
import { useVocab } from '../store/vocab'
import { useQuestions } from '../store/questions'
import { useExams } from '../store/exams'
import { toast } from '../store/ui'

export type CloudPayload = {
  v: 1
  savedAt: number
  stores: Record<string, Record<string, unknown>>
}

let client: SupabaseClient | null = null

export function supabase() {
  if (!cloudEnabled()) throw new Error('云端未配置')
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return client
}

// 未生成数据库类型，运行时表操作走 any
const table = () => (supabase().from('user_data') as any)

/** 各 store 里需要同步的数据键（函数与内部状态不参与） */
const SYNC_KEYS: Record<string, string[]> = {
  settings: ['userName', 'theme', 'ai', 'pomo'],
  pomodoro: ['sessions'],
  todos: ['todos'],
  notes: ['notes'],
  vocab: ['banks', 'activeBankId', 'progress', 'dailyNew', 'log'],
  questions: ['questions', 'attempts'],
  exams: ['exams'],
}

const STORES: Record<string, { getState: () => Record<string, unknown>; setState: (p: Record<string, unknown>) => void }> = {
  settings: useSettings as unknown as any,
  pomodoro: usePomodoro as unknown as any,
  todos: useTodos as unknown as any,
  notes: useNotes as unknown as any,
  vocab: useVocab as unknown as any,
  questions: useQuestions as unknown as any,
  exams: useExams as unknown as any,
}

function collectPayload(): CloudPayload {
  const stores: Record<string, Record<string, unknown>> = {}
  for (const [name, keys] of Object.entries(SYNC_KEYS)) {
    const state = STORES[name].getState()
    const picked: Record<string, unknown> = {}
    for (const k of keys) picked[k] = state[k]
    stores[name] = picked
  }
  return { v: 1, savedAt: Date.now(), stores }
}

function applyPayload(p: CloudPayload) {
  if (!p?.stores) return
  for (const [name, data] of Object.entries(p.stores)) {
    const store = STORES[name]
    if (store && data && typeof data === 'object') store.setState(data)
  }
}

function friendlyAuthError(e: { message?: string } | string): string {
  const msg = typeof e === 'string' ? e : e.message ?? ''
  if (/Invalid login credentials/i.test(msg)) return '邮箱或密码不对'
  if (/already registered/i.test(msg)) return '这个邮箱已注册过，直接登录即可'
  if (/Password should be at least/i.test(msg)) return '密码至少 6 位'
  if (/valid email/i.test(msg)) return '邮箱格式不对'
  if (/Email not confirmed/i.test(msg)) return '请先去邮箱点击确认邮件，再到设置里关闭「Confirm email」可跳过这步'
  if (/rate limit/i.test(msg)) return '操作太频繁了，稍等再试'
  if (/Failed to fetch|NetworkError/i.test(msg)) return '连不上云端：请检查 Supabase 地址是否填对、项目是否暂停'
  return msg || '未知错误'
}

export async function cloudSignUp(email: string, password: string): Promise<{ needConfirm: boolean }> {
  const { data, error } = await supabase().auth.signUp({ email, password })
  if (error) throw new Error(friendlyAuthError(error))
  return { needConfirm: !data.session }
}

export async function cloudSignIn(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password })
  if (error) throw new Error(friendlyAuthError(error))
}

export async function cloudSignOut() {
  await supabase().auth.signOut()
}

export async function getCloudUser(): Promise<{ id: string; email: string } | null> {
  if (!cloudEnabled()) return null
  const { data } = await supabase().auth.getSession()
  const u = data.session?.user
  return u ? { id: u.id, email: u.email ?? '' } : null
}

const SYNC_META_KEY = 'eternity-cloudsync'

export function lastSyncedAt(): number {
  return Number(localStorage.getItem(SYNC_META_KEY) || 0)
}

/** 登录后调用：云端有数据则覆盖本地，没有则把本机数据当作初始上传 */
export async function pullCloud(userId: string): Promise<{ applied: 'remote' | 'local' }> {
  const { data, error } = await table()
    .select('payload')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(friendlyAuthError(error))
  const remote = data?.payload as CloudPayload | undefined
  if (remote?.stores) {
    applyPayload(remote)
    localStorage.setItem(SYNC_META_KEY, String(remote.savedAt ?? Date.now()))
    return { applied: 'remote' }
  }
  await pushCloud(userId)
  return { applied: 'local' }
}

/** 把当前全部数据整包写到云端（last-write-wins） */
export async function pushCloud(userId: string) {
  const payload = collectPayload()
  const { error } = await table()
    .upsert({ id: userId, payload, updated_at: new Date().toISOString() })
  if (error) throw new Error(friendlyAuthError(error))
  localStorage.setItem(SYNC_META_KEY, String(payload.savedAt))
}

let syncTimer: ReturnType<typeof setTimeout> | null = null

/** 数据变化后的防抖自动同步（登录状态下调用一次即可） */
export function startAutoSync(getUserId: () => string | null) {
  const handler = () => {
    const uid = getUserId()
    if (!uid) return
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(async () => {
      try {
        await pushCloud(uid)
      } catch (e) {
        console.warn('[cloud] 自动同步失败：', e instanceof Error ? e.message : e)
      }
    }, 2000)
  }
  const unsubs = Object.values(STORES).map((s) => (s as unknown as { subscribe: (fn: () => void) => () => void }).subscribe(handler))
  return () => unsubs.forEach((u) => u())
}

export { toast }

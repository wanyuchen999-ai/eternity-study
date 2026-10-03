export const DAY = 86400000

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export function todayKey(d: Date | number = new Date()) {
  const date = typeof d === 'number' ? new Date(d) : d
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const fmtDate = (ts: number) => todayKey(new Date(ts))

export function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const fmtDateTime = (ts: number) => `${fmtDate(ts)} ${fmtTime(ts)}`

export function fmtMMSS(totalSec: number) {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function lastNDays(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY)
    out.push(todayKey(d))
  }
  return out
}

export const weekdayLabel = (key: string) => {
  const d = new Date(key + 'T12:00:00')
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

export function download(filename: string, text: string, mime = 'application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: mime }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const daysUntil = (dateStr: string) => {
  const end = new Date(dateStr + 'T23:59:59').getTime()
  return Math.ceil((end - Date.now()) / DAY)
}

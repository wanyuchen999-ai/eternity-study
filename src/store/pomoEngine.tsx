import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSettings } from './settings'
import { usePomodoro } from './pomodoro'
import { toast } from './ui'
import { fmtMMSS } from '../lib/util'

export type Mode = 'focus' | 'short' | 'long'

type PomoCtx = {
  mode: Mode
  running: boolean
  remain: number
  cycle: number
  label: string
  total: number
  setLabel: (s: string) => void
  start: () => void
  pause: () => void
  reset: () => void
  switchMode: (m: Mode) => void
}

const Ctx = createContext<PomoCtx | null>(null)

function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    ;[0, 0.35, 0.7].forEach((offset) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g)
      g.connect(ctx.destination)
      o.frequency.value = 880
      g.gain.value = 0.08
      o.start(ctx.currentTime + offset)
      o.stop(ctx.currentTime + offset + 0.22)
    })
  } catch {
    /* 无声环境忽略 */
  }
}

export function PomoEngineProvider({ children }: { children: ReactNode }) {
  const pomo = useSettings((s) => s.pomo)
  const [mode, setMode] = useState<Mode>('focus')
  const [running, setRunning] = useState(false)
  const [remain, setRemain] = useState(pomo.focusMin * 60)
  const [cycle, setCycle] = useState(0)
  const [label, setLabel] = useState('')
  const endRef = useRef(0)

  const dur = (m: Mode) => (m === 'focus' ? pomo.focusMin : m === 'short' ? pomo.shortMin : pomo.longMin) * 60

  const complete = () => {
    setRunning(false)
    if (pomo.soundOn) beep()
    if (mode === 'focus') {
      usePomodoro.getState().add({
        start: Date.now() - pomo.focusMin * 60000,
        end: Date.now(),
        minutes: pomo.focusMin,
        label,
      })
      const c = cycle + 1
      setCycle(c)
      const next: Mode = c % Math.max(1, pomo.longEvery) === 0 ? 'long' : 'short'
      setMode(next)
      setRemain(dur(next))
      toast('🎉 专注完成，休息一下吧！', 'ok')
    } else {
      setMode('focus')
      setRemain(dur('focus'))
      toast('休息结束，开始下一轮专注！', 'ok')
    }
    if (pomo.autoNext) setRunning(true)
  }

  useEffect(() => {
    if (!running) return
    endRef.current = Date.now() + remain * 1000
    const t = setInterval(() => {
      const r = Math.max(0, Math.round((endRef.current - Date.now()) / 1000))
      setRemain(r)
      if (r <= 0) {
        clearInterval(t)
        complete()
      }
    }, 250)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    if (running) document.title = `${fmtMMSS(remain)} ${mode === 'focus' ? '专注中' : '休息'} · Eternity 学习台`
    else document.title = 'Eternity 学习台'
  }, [remain, running, mode])

  const ctx: PomoCtx = {
    mode,
    running,
    remain,
    cycle,
    label,
    total: dur(mode),
    setLabel,
    start: () => setRunning(true),
    pause: () => setRunning(false),
    reset: () => {
      setRunning(false)
      setRemain(dur(mode))
    },
    switchMode: (m) => {
      setRunning(false)
      setMode(m)
      setRemain(dur(m))
    },
  }

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
}

export function usePomo() {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePomo 必须在 PomoEngineProvider 内使用')
  return c
}

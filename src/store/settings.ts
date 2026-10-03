import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { profileStorage } from '../lib/profileStorage'

export type AISettings = {
  baseUrl: string
  apiKey: string
  chatModel: string
  visionModel: string
  asrModel: string
}

export type PomoSettings = {
  focusMin: number
  shortMin: number
  longMin: number
  longEvery: number
  autoNext: boolean
  soundOn: boolean
  dailyGoal: number
}

type State = {
  userName: string
  theme: string
  ai: AISettings
  pomo: PomoSettings
  set: (p: Partial<Omit<State, 'set' | 'setAI' | 'setPomo'>>) => void
  setAI: (p: Partial<AISettings>) => void
  setPomo: (p: Partial<PomoSettings>) => void
}

export const useSettings = create<State>()(
  persist(
    (set) => ({
      userName: '',
      theme: 'indigo',
      ai: {
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: '',
        chatModel: 'glm-4-flash',
        visionModel: 'glm-4v-flash',
        asrModel: 'glm-asr',
      },
      pomo: { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoNext: false, soundOn: true, dailyGoal: 8 },
      set: (p) => set(p),
      setAI: (p) => set((s) => ({ ai: { ...s.ai, ...p } })),
      setPomo: (p) => set((s) => ({ pomo: { ...s.pomo, ...p } })),
    }),
    { name: 'eternity-settings', storage: createJSONStorage(() => profileStorage) }
  )
)

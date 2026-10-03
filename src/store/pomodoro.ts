import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { uid } from '../lib/util'
import { profileStorage } from '../lib/profileStorage'

export type PomoSession = { id: string; start: number; end: number; minutes: number; label: string }

type State = {
  sessions: PomoSession[]
  add: (s: Omit<PomoSession, 'id'>) => void
}

export const usePomodoro = create<State>()(
  persist(
    (set) => ({
      sessions: [],
      add: (s) =>
        set((st) => ({
          sessions: [...st.sessions, { ...s, id: uid() }].slice(-2000),
        })),
    }),
    { name: 'eternity-pomodoro', storage: createJSONStorage(() => profileStorage) }
  )
)

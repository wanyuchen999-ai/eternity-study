import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { uid } from '../lib/util'
import { profileStorage } from '../lib/profileStorage'

export type Exam = { id: string; name: string; date: string; subject?: string }

type State = {
  exams: Exam[]
  add: (name: string, date: string, subject?: string) => void
  remove: (id: string) => void
}

export const useExams = create<State>()(
  persist(
    (set) => ({
      exams: [],
      add: (name, date, subject) =>
        set((s) => ({ exams: [...s.exams, { id: uid(), name: name.trim(), date, subject }] })),
      remove: (id) => set((s) => ({ exams: s.exams.filter((e) => e.id !== id) })),
    }),
    { name: 'eternity-exams', storage: createJSONStorage(() => profileStorage) }
  )
)

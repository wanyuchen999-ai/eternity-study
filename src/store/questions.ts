import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { uid } from '../lib/util'
import { profileStorage } from '../lib/profileStorage'

export type QType = 'single' | 'multiple' | 'judge' | 'fill' | 'short'

export const QTYPE_LABEL: Record<QType, string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
  fill: '填空',
  short: '简答',
}

export type QOption = { key: string; text: string }

export type Question = {
  id: string
  type: QType
  stem: string
  options?: QOption[]
  answer: string
  explanation?: string
  subject?: string
  source: 'ocr' | 'text' | 'manual' | 'note'
  createdAt: number
  wrongCount?: number
  lastWrongAt?: number
  mastered?: boolean
}

export type Attempt = { id: string; qid: string; correct: boolean; at: number }

type State = {
  questions: Question[]
  attempts: Attempt[]
  addMany: (qs: Omit<Question, 'id' | 'createdAt' | 'wrongCount' | 'lastWrongAt' | 'mastered'>[]) => void
  remove: (id: string) => void
  recordAttempt: (qid: string, correct: boolean) => void
  toggleMastered: (id: string) => void
}

export const useQuestions = create<State>()(
  persist(
    (set) => ({
      questions: [],
      attempts: [],
      addMany: (qs) =>
        set((s) => ({
          questions: [...qs.map((q) => ({ ...q, id: uid(), createdAt: Date.now() })), ...s.questions],
        })),
      remove: (id) => set((s) => ({ questions: s.questions.filter((q) => q.id !== id) })),
      recordAttempt: (qid, correct) =>
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === qid
              ? correct
                ? q
                : { ...q, wrongCount: (q.wrongCount ?? 0) + 1, lastWrongAt: Date.now(), mastered: false }
              : q
          ),
          attempts: [...s.attempts.slice(-1999), { id: uid(), qid, correct, at: Date.now() }],
        })),
      toggleMastered: (id) =>
        set((s) => ({ questions: s.questions.map((q) => (q.id === id ? { ...q, mastered: !q.mastered } : q)) })),
    }),
    { name: 'eternity-questions', storage: createJSONStorage(() => profileStorage) }
  )
)

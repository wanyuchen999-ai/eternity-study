import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { uid, todayKey, DAY } from '../lib/util'
import { profileStorage } from '../lib/profileStorage'

export type Word = { id: string; term: string; definition: string; phonetic?: string }
export type Bank = { id: string; name: string; createdAt: number; words: Word[] }
export type VProg = { box: number; due: number; seen: number; correct: number; lastAt: number }

/** 艾宾浩斯复习间隔（天） */
export const EBBS = [1, 2, 4, 7, 15, 30]

type State = {
  banks: Bank[]
  activeBankId: string
  progress: Record<string, VProg>
  dailyNew: number
  log: Record<string, { new: number; review: number }>
  addBank: (name: string, words: { term: string; definition: string; phonetic?: string }[]) => void
  removeBank: (id: string) => void
  setActive: (id: string) => void
  setDailyNew: (n: number) => void
  grade: (wordId: string, g: 0 | 1 | 2) => void
  resetProgress: (bankId: string) => void
}

export const useVocab = create<State>()(
  persist(
    (set, get) => ({
      banks: [],
      activeBankId: '',
      progress: {},
      dailyNew: 10,
      log: {},
      addBank: (name, words) => {
        const id = uid()
        const bank: Bank = {
          id,
          name: name.trim() || '未命名词库',
          createdAt: Date.now(),
          words: words.map((w, i) => ({ id: `${id}#${i}`, term: w.term, definition: w.definition || '（待补充）', phonetic: w.phonetic })),
        }
        set((s) => ({ banks: [...s.banks, bank], activeBankId: s.activeBankId || id }))
      },
      removeBank: (id) =>
        set((s) => {
          const progress: Record<string, VProg> = {}
          for (const [k, v] of Object.entries(s.progress)) if (!k.startsWith(id + '#')) progress[k] = v
          const banks = s.banks.filter((b) => b.id !== id)
          return { banks, progress, activeBankId: s.activeBankId === id ? banks[0]?.id ?? '' : s.activeBankId }
        }),
      setActive: (id) => set({ activeBankId: id }),
      setDailyNew: (n) => set({ dailyNew: Math.max(1, Math.min(100, Math.round(n) || 10)) }),
      grade: (wordId, g) =>
        set((s) => {
          const p = s.progress[wordId]
          const isNew = !p
          let box = p?.box ?? 0
          if (g === 2) box = Math.min(box + 1, EBBS.length - 1)
          if (g === 0) box = 0
          const due = g === 0 ? Date.now() + 10 * 60 * 1000 : Date.now() + EBBS[box] * DAY
          const progress = {
            ...s.progress,
            [wordId]: { box, due, seen: (p?.seen ?? 0) + 1, correct: (p?.correct ?? 0) + (g === 2 ? 1 : 0), lastAt: Date.now() },
          }
          const key = todayKey()
          const dayLog = s.log[key] ?? { new: 0, review: 0 }
          const log = { ...s.log, [key]: isNew ? { ...dayLog, new: dayLog.new + 1 } : { ...dayLog, review: dayLog.review + 1 } }
          return { progress, log }
        }),
      resetProgress: (bankId) =>
        set((s) => {
          const progress: Record<string, VProg> = {}
          for (const [k, v] of Object.entries(s.progress)) if (!k.startsWith(bankId + '#')) progress[k] = v
          return { progress }
        }),
    }),
    { name: 'eternity-vocab', storage: createJSONStorage(() => profileStorage) }
  )
)

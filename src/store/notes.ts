import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { profileStorage } from '../lib/profileStorage'

export type Note = {
  id: string
  title: string
  content: string
  source: 'record' | 'chat' | 'summary' | 'manual'
  tags: string[]
  createdAt: number
  updatedAt: number
}

type State = {
  notes: Note[]
  upsert: (n: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => string
  update: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => void
  remove: (id: string) => void
}

export const SOURCE_LABEL: Record<Note['source'], string> = {
  record: '课堂录音',
  chat: 'AI 对话',
  summary: '笔记归纳',
  manual: '手动笔记',
}

export const useNotes = create<State>()(
  persist(
    (set, get) => ({
      notes: [],
      upsert: (n) => {
        const now = Date.now()
        if (n.id) {
          const old = get().notes.find((x) => x.id === n.id)
          if (old) {
            set((s) => ({ notes: s.notes.map((x) => (x.id === n.id ? { ...x, ...n, id: n.id, updatedAt: now } : x)) }))
            return n.id
          }
        }
        const id = n.id ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
        set((s) => ({ notes: [{ ...n, id, createdAt: now, updatedAt: now } as Note, ...s.notes] }))
        return id
      },
      update: (id, patch) =>
        set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)) })),
      remove: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
    }),
    { name: 'eternity-notes', storage: createJSONStorage(() => profileStorage) }
  )
)

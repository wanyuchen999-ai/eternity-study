import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { uid } from '../lib/util'
import { profileStorage } from '../lib/profileStorage'

export type Todo = {
  id: string
  title: string
  done: boolean
  priority: 2 | 1 | 0 // 高 中 低
  due?: string // yyyy-mm-dd
  subject?: string
  createdAt: number
  doneAt?: number
}

type State = {
  todos: Todo[]
  add: (t: { title: string; priority?: 2 | 1 | 0; due?: string; subject?: string }) => void
  addMany: (items: { title: string; priority?: 2 | 1 | 0; due?: string; subject?: string }[]) => string[]
  toggle: (id: string) => void
  update: (id: string, patch: Partial<Omit<Todo, 'id'>>) => void
  remove: (id: string) => void
  clearDone: () => void
}

export const useTodos = create<State>()(
  persist(
    (set) => ({
      todos: [],
      add: ({ title, priority = 1, due, subject }) =>
        set((s) => ({
          todos: [{ id: uid(), title: title.trim(), done: false, priority, due, subject, createdAt: Date.now() }, ...s.todos],
        })),
      addMany: (items) => {
        const created = items.map((it) => ({
          id: uid(),
          title: it.title.trim(),
          done: false,
          priority: it.priority ?? 1,
          due: it.due,
          subject: it.subject,
          createdAt: Date.now(),
        }))
        set((s) => ({ todos: [...created, ...s.todos] }))
        return created.map((t) => t.id)
      },
      toggle: (id) =>
        set((s) => ({
          todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : undefined } : t)),
        })),
      update: (id, patch) => set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      remove: (id) => set((s) => ({ todos: s.todos.filter((t) => t.id !== id) })),
      clearDone: () => set((s) => ({ todos: s.todos.filter((t) => !t.done) })),
    }),
    { name: 'eternity-todos', storage: createJSONStorage(() => profileStorage) }
  )
)

import { create } from 'zustand'
import { uid } from '../lib/util'

export type ToastType = 'info' | 'ok' | 'err'
export type Toast = { id: string; type: ToastType; text: string }

type S = { toasts: Toast[]; push: (type: ToastType, text: string) => void; drop: (id: string) => void }

export const useUI = create<S>((set) => ({
  toasts: [],
  push: (type, text) => {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts, { id, type, text }].slice(-4) }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3600)
  },
  drop: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (text: string, type: ToastType = 'info') => useUI.getState().push(type, text)

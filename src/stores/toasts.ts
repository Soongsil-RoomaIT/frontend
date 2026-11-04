import { create } from 'zustand'

export interface Toast {
  id: number
  tone: 'success' | 'error' | 'info'
  title: string
  detail?: string
}

interface ToastState {
  toasts: Toast[]
}

export const useToastStore = create<ToastState>()(() => ({ toasts: [] }))

const MAX_TOASTS = 4
const DURATION_MS: Record<Toast['tone'], number> = { success: 4_000, info: 5_000, error: 8_000 }
let nextId = 1

export function dismissToast(id: number) {
  useToastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

export function showToast(toast: Omit<Toast, 'id'>) {
  const id = nextId++
  // Oldest drops off first so a burst of results can't flood the screen
  useToastStore.setState((s) => ({ toasts: [...s.toasts, { ...toast, id }].slice(-MAX_TOASTS) }))
  setTimeout(() => dismissToast(id), DURATION_MS[toast.tone])
  return id
}

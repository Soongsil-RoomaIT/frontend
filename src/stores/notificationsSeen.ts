import { create } from 'zustand'

/**
 * When the user last looked at the notification list, for servers that don't track read state.
 * Per browser, like a mail client's "last checked".
 */
const STORAGE_KEY = 'room-care.notifications-seen-at'

function load(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const ms = raw === null ? NaN : Number(raw)
    return Number.isFinite(ms) ? ms : 0
  } catch {
    return 0
  }
}

export const useNotificationsSeenStore = create<{ seenAtMs: number }>()(() => ({ seenAtMs: load() }))

export function markNotificationsSeen(atMs = Date.now()) {
  useNotificationsSeenStore.setState({ seenAtMs: atMs })
  try {
    localStorage.setItem(STORAGE_KEY, String(atMs))
  } catch {
    // Applies for this session even if it can't be remembered
  }
}

import { useSyncExternalStore } from 'react'

// One shared 1-second ticker for every "n초 전" label, instead of an interval per component
const listeners = new Set<() => void>()
let now = Date.now()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer === null) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((l) => l())
    }, 1_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** Current epoch ms, re-rendering the caller once per second. */
export function useNow() {
  return useSyncExternalStore(subscribe, () => now)
}

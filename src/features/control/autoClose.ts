import type { Device } from '@/api/types'
import { supportedActions } from './catalog'

/** FR-03 default, used only to size the progress bar when the deadline is oddly close to `updatedAt` */
export const DOOR_AUTO_CLOSE_MS = 10 * 60_000

/**
 * Epoch ms when the edge will auto-close the door, or null when nothing is scheduled
 * (door closed, no deadline reported, or no actuator to close it).
 *
 * The edge owns the timer (ADR-010) and reports the deadline; this only displays it. Without a
 * reported deadline nothing is shown: guessing "updatedAt + 10 min" could promise a close that
 * never comes.
 */
export function autoCloseDeadline(device: Device): number | null {
  if (device.type !== 'FRONT_DOOR' || device.state !== 'OPEN') return null
  if (!supportedActions(device).includes('CLOSE')) return null
  if (!device.autoCloseAt) return null
  return Date.parse(device.autoCloseAt)
}

/** "9:41" style countdown; never negative */
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

import type { Device } from '@/api/types'
import { supportedActions } from './catalog'

/** FR-03: the front door closes itself after being open this long. Server may override via `autoCloseAt`. */
export const DOOR_AUTO_CLOSE_MS = 10 * 60_000

/**
 * Epoch ms when the system will auto-close the door, or null when no auto-close applies
 * (door closed, auto-close disabled by the server, or no actuator to close it).
 *
 * This only *displays* the deadline. The closing itself must happen on the server/edge:
 * the user is away and the browser is usually closed.
 */
export function autoCloseDeadline(device: Device): number | null {
  if (device.type !== 'FRONT_DOOR' || device.state !== 'OPEN') return null
  if (!supportedActions(device).includes('CLOSE')) return null
  if (device.autoCloseAt === null) return null
  if (device.autoCloseAt !== undefined) return Date.parse(device.autoCloseAt)
  return Date.parse(device.updatedAt) + DOOR_AUTO_CLOSE_MS
}

/** "9:41" style countdown; never negative */
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

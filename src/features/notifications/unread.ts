import type { AppNotification } from '@/api/types'

/**
 * Which notifications count as unread. A server that tracks `read` is the source of truth; one
 * that doesn't gets a local "last seen" time instead (a date-less item can't be compared, so it
 * never counts).
 */
export function isUnread(n: AppNotification, seenAtMs: number): boolean {
  if (n.read !== null) return !n.read
  return n.createdAt !== null && Date.parse(n.createdAt) > seenAtMs
}

export const countUnread = (items: readonly AppNotification[] | undefined, seenAtMs: number) =>
  items?.filter((n) => isUnread(n, seenAtMs)).length ?? 0

/** Puts one notification at the top of a list, replacing an existing entry with the same id */
export function prependNotification(items: readonly AppNotification[], n: AppNotification): AppNotification[] {
  return [n, ...items.filter((x) => x.id !== n.id)]
}

/** Describes what a notification is about from its `data`, for the icon */
export type NotificationKind = 'device' | 'recovery' | 'prediction' | 'recommendation' | 'other'

export function notificationKind(n: AppNotification): NotificationKind {
  const type = typeof n.data.type === 'string' ? n.data.type : typeof n.data.kind === 'string' ? n.data.kind : ''
  if (/recover|reconnect|edge/i.test(type)) return 'recovery'
  if (/predict|forecast/i.test(type)) return 'prediction'
  if (/recommend/i.test(type)) return 'recommendation'
  if (/device|command|automation|control/i.test(type) || 'deviceId' in n.data || 'commandId' in n.data) return 'device'
  return 'other'
}

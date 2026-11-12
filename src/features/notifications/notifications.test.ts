import { describe, expect, it } from 'vitest'
import type { AppNotification } from '@/api/types'
import { countUnread, isUnread, notificationKind, prependNotification } from './unread'

const T = Date.parse('2026-10-01T10:00:00.000Z')
const n = (over: Partial<AppNotification>): AppNotification => ({ id: 'n', title: null, body: 'x', createdAt: null, read: null, data: {}, ...over })

describe('isUnread', () => {
  it('trusts the server when it tracks read state', () => {
    expect(isUnread(n({ read: false, createdAt: new Date(T - 1).toISOString() }), T)).toBe(true)
    expect(isUnread(n({ read: true, createdAt: new Date(T + 1).toISOString() }), T)).toBe(false)
  })

  it('compares with the local seen time otherwise', () => {
    expect(isUnread(n({ createdAt: new Date(T + 1).toISOString() }), T)).toBe(true)
    expect(isUnread(n({ createdAt: new Date(T).toISOString() }), T)).toBe(false)
    expect(isUnread(n({ createdAt: null }), T)).toBe(false)
  })

  it('counts', () => {
    expect(countUnread([n({ read: false }), n({ id: 'b', read: true }), n({ id: 'c', createdAt: new Date(T + 5).toISOString() })], T)).toBe(2)
    expect(countUnread(undefined, T)).toBe(0)
  })
})

describe('prependNotification', () => {
  it('puts the new one first and replaces a duplicate id', () => {
    const list = [n({ id: 'a' }), n({ id: 'b' })]
    expect(prependNotification(list, n({ id: 'c' })).map((x) => x.id)).toEqual(['c', 'a', 'b'])
    expect(prependNotification(list, n({ id: 'b', body: 'new' })).map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('notificationKind', () => {
  it.each([
    [{ type: 'device.command' }, 'device'],
    [{ deviceId: 'w' }, 'device'],
    [{ type: 'edge.recovered' }, 'recovery'],
    [{ type: 'prediction.control' }, 'prediction'],
    [{ type: 'recommendation.applied' }, 'recommendation'],
    [{}, 'other'],
    [{ type: 42 }, 'other'],
  ])('%j → %s', (data, kind) => {
    expect(notificationKind(n({ data }))).toBe(kind)
  })
})

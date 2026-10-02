import { describe, expect, it } from 'vitest'
import type { Device } from '@/api/types'
import { availableActions, isControllable, kindOf, supportedActions } from './catalog'
import { autoCloseDeadline, DOOR_AUTO_CLOSE_MS, formatCountdown } from './autoClose'

const t = '2026-10-02T10:00:00.000Z'
const dev = (over: Partial<Device>): Device => ({
  id: 'x',
  type: 'WINDOW',
  name: 'x',
  state: 'CLOSED',
  updatedAt: t,
  ...over,
})

describe('actions', () => {
  it('falls back to type defaults when the server sends none', () => {
    expect(supportedActions(dev({ type: 'WINDOW' }))).toEqual(['OPEN', 'CLOSE'])
    expect(availableActions(dev({ type: 'WINDOW', state: 'CLOSED' }))).toEqual(['OPEN'])
    expect(availableActions(dev({ type: 'AIR_PURIFIER', state: 'ON' }))).toEqual(['OFF'])
  })

  it('does not offer remote door opening by default', () => {
    expect(availableActions(dev({ type: 'FRONT_DOOR', state: 'OPEN' }))).toEqual(['CLOSE'])
    expect(availableActions(dev({ type: 'FRONT_DOOR', state: 'CLOSED' }))).toEqual([])
  })

  it('lets the server override the defaults', () => {
    expect(availableActions(dev({ type: 'FRONT_DOOR', state: 'CLOSED', actions: ['OPEN', 'CLOSE'] }))).toEqual(['OPEN'])
    expect(isControllable(dev({ type: 'WINDOW', actions: [] }))).toBe(false)
  })

  it('handles an unknown device type without crashing', () => {
    expect(kindOf('HUMIDIFIER').icon('ON')).toBeTruthy()
    expect(isControllable(dev({ type: 'HUMIDIFIER', state: 'OFF' }))).toBe(false)
    expect(availableActions(dev({ type: 'HUMIDIFIER', state: 'OFF', actions: ['ON', 'OFF'] }))).toEqual(['ON'])
  })

  it('is not fooled by prototype keys as a type', () => {
    expect(kindOf('constructor').defaultActions).toEqual([])
  })
})

describe('autoCloseDeadline (FR-03)', () => {
  const door = (over: Partial<Device>) => dev({ type: 'FRONT_DOOR', state: 'OPEN', ...over })

  it('derives updatedAt + 10 min when the server gives no deadline', () => {
    expect(autoCloseDeadline(door({}))).toBe(Date.parse(t) + DOOR_AUTO_CLOSE_MS)
  })
  it('prefers the server deadline', () => {
    expect(autoCloseDeadline(door({ autoCloseAt: '2026-10-02T10:00:30.000Z' }))).toBe(
      Date.parse('2026-10-02T10:00:30.000Z'),
    )
  })
  it('is null when disabled, closed, not a door, or not closable', () => {
    expect(autoCloseDeadline(door({ autoCloseAt: null }))).toBeNull()
    expect(autoCloseDeadline(door({ state: 'CLOSED' }))).toBeNull()
    expect(autoCloseDeadline(dev({ type: 'WINDOW', state: 'OPEN' }))).toBeNull()
    expect(autoCloseDeadline(door({ actions: [] }))).toBeNull()
  })
})

describe('formatCountdown', () => {
  it.each([
    [600_000, '10:00'],
    [61_000, '1:01'],
    [999, '0:01'],
    [0, '0:00'],
    [-5_000, '0:00'],
  ])('%i ms → %s', (ms, out) => expect(formatCountdown(ms)).toBe(out))
})

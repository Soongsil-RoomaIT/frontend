import { describe, expect, it } from 'vitest'
import { outdoorSlots, peakRainChance, slotLabel } from './outdoorSlots'

const HOUR = 3_600_000
// 21:49 — well past the start of its hour, where naive rounding goes wrong
const NOW = Date.parse('2026-10-01T12:49:00.000Z')
const hourStart = Math.floor(NOW / HOUR) * HOUR
const slot = (h: number, pop: number | null = 10) => ({ time: new Date(hourStart + h * HOUR).toISOString(), temp: null, humidity: null, precipitationProb: pop, pm25: null, pm10: null })

describe('outdoorSlots', () => {
  it('keeps the hours overlapping ±2h and sorts them', () => {
    const slots = outdoorSlots({ hourly: [slot(3), slot(-3), slot(1), slot(-2), slot(0), slot(2), slot(-1)] }, NOW)
    expect(slots.map((s) => Date.parse(s.time))).toEqual([-2, -1, 0, 1, 2].map((h) => hourStart + h * HOUR))
  })
})

describe('slotLabel', () => {
  it.each([
    [0, '지금'],
    [-1, '1시간 전'],
    [-2, '2시간 전'],
    [1, '1시간 후'],
    [2, '2시간 후'],
  ])('hour %i → %s', (h, label) => {
    expect(slotLabel(hourStart + h * HOUR, NOW)).toBe(label)
  })
  it('works right at the top of the hour', () => {
    expect(slotLabel(hourStart, hourStart)).toBe('지금')
    expect(slotLabel(hourStart + HOUR, hourStart)).toBe('1시간 후')
  })
})

describe('peakRainChance', () => {
  it('includes the current hour and ignores the past and unknowns', () => {
    expect(peakRainChance([slot(-1, 90), slot(0, 80), slot(1, 60), slot(2, null)], NOW)).toBe(80)
    expect(peakRainChance([slot(-1, 90)], NOW)).toBeNull()
    expect(peakRainChance([], NOW)).toBeNull()
  })
})

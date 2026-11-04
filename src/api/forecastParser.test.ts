import { describe, expect, it, vi } from 'vitest'
import { isAutomationSettings, parseAutomationSettings, parseForecast } from './forecastParser'

const t = '2026-10-01T10:00:00.000Z'
const decision = { id: 'd1', deviceId: 'window-1', action: 'CLOSE', status: 'PROPOSED' }

describe('parseForecast', () => {
  it('reads a full response', () => {
    const f = parseForecast({
      source: 'kma',
      updatedAt: t,
      stale: false,
      message: '안내',
      weather: [{ time: t, temp: 20, humidity: 50, precipitationProb: 10, pm25: 12 }],
      observations: [{ time: t, temp: 19, humidity: 55, precipitation: 0 }],
      decisions: [decision],
    })
    expect(f.source).toBe('kma')
    expect(f.weather[0]?.pm25).toBe(12)
    expect(f.observations[0]?.precipitation).toBe(0)
    expect(f.decisions).toEqual([decision])
  })

  it('gives a bare response empty defaults instead of failing', () => {
    expect(parseForecast({})).toEqual({
      source: null,
      updatedAt: null,
      stale: false,
      message: null,
      weather: [],
      observations: [],
      decisions: [],
    })
  })

  it('turns a missing or null value into no data, keeping the point', () => {
    const [point] = parseForecast({ weather: [{ time: t, temp: 20, pm25: null, humidity: 'x' }] }).weather
    expect(point).toEqual({ time: t, temp: 20, humidity: null, precipitationProb: null, pm25: null })
  })

  it('drops only the malformed records', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = parseForecast({
      weather: [{ temp: 1 }, { time: 'nope' }, { time: t }],
      decisions: [decision, { id: 'x' }, { ...decision, id: 'y', action: 'EXPLODE' }],
    })
    expect(f.weather).toHaveLength(1)
    expect(f.decisions).toEqual([decision])
    warn.mockRestore()
  })

  it('accepts decisions with nulls for optional fields and unknown statuses', () => {
    const d = { ...decision, status: 'SNOOZED', reasons: null, createdAt: null, commandId: null, reason: null }
    expect(parseForecast({ decisions: [d] }).decisions).toHaveLength(1)
  })

  it.each([[null], ['text'], [[]]])('rejects %j as a forecast', (v) => {
    expect(() => parseForecast(v)).toThrow()
  })
})

describe('automation settings', () => {
  it('keeps fields it does not know, so a save sends them back', () => {
    const s = parseAutomationSettings({ enabled: true, mode: 'AUTO', humidityOn: 60, quietHours: '22-07' })
    expect(s.quietHours).toBe('22-07')
  })

  it.each([
    [null],
    [{ mode: 'AUTO' }],
    [{ enabled: 'yes', mode: 'AUTO' }],
    [{ enabled: true, mode: 'TURBO' }],
  ])('rejects %j', (v) => {
    expect(isAutomationSettings(v)).toBe(false)
    expect(() => parseAutomationSettings(v)).toThrow()
  })
})

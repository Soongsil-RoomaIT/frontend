import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/api/queryKeys'
import type { AutomationSettings, Decision, Device, Forecast } from '@/api/types'
import { useToastStore } from '@/stores/toasts'
import type { SystemStatus } from '@/features/monitoring/systemStatus'
import { startDecisionAlerts } from './decisionAlerts'
import { applyCommandResult, upsertDecision } from './decisionCache'
import { approvalBlockReason, decisionStatus, decisionTitle, diffDecisions, reasonText, sortDecisions } from './decisions'
import { buildWeatherSlots, peakRainChance, slotLabel } from './weatherSlots'

const HOUR = 3_600_000
const NOW = Date.parse('2026-10-01T14:30:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

const decision = (over: Partial<Decision> = {}): Decision => ({
  id: 'd1',
  deviceId: 'window-1',
  action: 'CLOSE',
  status: 'PROPOSED',
  ...over,
})
const forecast = (decisions: Decision[]): Forecast => ({
  source: null,
  updatedAt: null,
  stale: false,
  message: null,
  weather: [],
  observations: [],
  decisions,
})
const device: Device = { id: 'window-1', type: 'WINDOW', name: '창문', state: 'OPEN', updatedAt: iso(NOW) }
const ok: SystemStatus = { kind: 'ok' }

describe('decision display', () => {
  it('shows an unknown status as sent, even one named like an Object method', () => {
    expect(decisionStatus('SNOOZED').label).toBe('SNOOZED')
    expect(decisionStatus('constructor').label).toBe('constructor')
    expect(decisionStatus('EXECUTED').label).toBe('실행 완료')
  })

  it('titles with the device name, falling back to its id', () => {
    expect(decisionTitle(decision(), [device])).toBe('창문 닫기')
    expect(decisionTitle(decision({ deviceId: 'ghost' }), [device])).toBe('ghost 닫기')
    expect(decisionTitle(decision(), undefined)).toBe('window-1 닫기')
  })

  it('writes reasons with and without a threshold', () => {
    expect(reasonText({ factor: '강수확률', value: '80%', threshold: '60% 이상' })).toBe('강수확률 80% (기준 60% 이상)')
    expect(reasonText({ factor: '습도', value: 72 })).toBe('습도 72')
  })

  it('sorts newest first, keeping undated ones last', () => {
    const list = [
      decision({ id: 'a' }),
      decision({ id: 'b', createdAt: iso(NOW - HOUR) }),
      decision({ id: 'c', createdAt: iso(NOW) }),
    ]
    expect(sortDecisions(list).map((d) => d.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('approvalBlockReason', () => {
  const block = (
    over: Partial<Decision> = {},
    d: Device | null = device,
    s: SystemStatus = ok,
    busy = false,
    loading = false,
  ) => approvalBlockReason(decision(over), d ?? undefined, s, busy, loading)

  it('allows a normal recommendation', () => {
    expect(block()).toBeNull()
  })

  it.each<[SystemStatus]>([
    [{ kind: 'checking' }],
    [{ kind: 'server-disconnected', nextRetryAt: null }],
    [{ kind: 'edge-offline', lastSeenAt: iso(NOW) }],
    [{ kind: 'edge-local' }],
  ])('blocks while %j', (status) => {
    expect(block({}, device, status)).not.toBeNull()
  })

  it('blocks when the device is already there, busy, or still unknown', () => {
    expect(block({ action: 'OPEN' })).toContain('이미 열림')
    expect(block({}, device, ok, true)).not.toBeNull()
    expect(block({}, null, ok, false, true)).not.toBeNull()
  })

  it('allows a device missing from a loaded list; the server decides', () => {
    expect(block({}, null)).toBeNull()
  })
})

describe('diffDecisions', () => {
  const seen = (...e: [string, string][]) => new Map(e)

  it('reports new recommendations and finished ones', () => {
    const events = diffDecisions(seen(['a', 'APPROVED'], ['b', 'APPROVED']), [
      decision({ id: 'a', status: 'EXECUTED' }),
      decision({ id: 'b', status: 'FAILED' }),
      decision({ id: 'c' }),
    ])
    expect(events.map((e) => [e.decision.id, e.kind])).toEqual([
      ['a', 'executed'],
      ['b', 'failed'],
      ['c', 'proposed'],
    ])
  })

  it('stays quiet when nothing relevant changed', () => {
    expect(diffDecisions(seen(['a', 'EXECUTED']), [decision({ id: 'a', status: 'EXECUTED' })])).toEqual([])
    expect(diffDecisions(seen(['a', 'PROPOSED']), [decision({ id: 'a', status: 'EXPIRED' })])).toEqual([])
    expect(diffDecisions(seen(['a', 'PROPOSED']), [decision({ id: 'a', status: 'APPROVED' })])).toEqual([])
  })

  it('does not call a known decision new if a re-read returns it as PROPOSED again', () => {
    expect(diffDecisions(seen(['a', 'APPROVED']), [decision({ id: 'a' })])).toEqual([])
  })

  it('reports something that ran between two polls', () => {
    expect(diffDecisions(seen(), [decision({ status: 'EXECUTED' })])[0]?.kind).toBe('executed')
  })
})

describe('decision cache', () => {
  const client = (decisions: Decision[] | null) => {
    const q = new QueryClient()
    if (decisions) q.setQueryData(queryKeys.forecast, forecast(decisions))
    return q
  }
  const read = (q: QueryClient) => q.getQueryData<Forecast>(queryKeys.forecast)?.decisions

  it('replaces a known decision and puts a new one first', () => {
    const q = client([decision()])
    upsertDecision(q, decision({ status: 'APPROVED' }))
    expect(read(q)).toEqual([decision({ status: 'APPROVED' })])
    upsertDecision(q, decision({ id: 'd2' }))
    expect(read(q)?.map((d) => d.id)).toEqual(['d2', 'd1'])
  })

  it('does nothing before the forecast has loaded', () => {
    const q = client(null)
    upsertDecision(q, decision())
    expect(read(q)).toBeUndefined()
  })

  it('applies a command result to the decision that issued it', () => {
    const q = client([decision({ status: 'APPROVED', commandId: 'c1' })])
    applyCommandResult(q, { commandId: 'c1', deviceId: 'window-1', status: 'FAILED', reason: '모터 과부하' })
    expect(read(q)?.[0]).toMatchObject({ status: 'FAILED', reason: '모터 과부하' })
  })

  it('ignores the result of an unrelated command', () => {
    const q = client([decision({ status: 'APPROVED', commandId: 'c1' })])
    applyCommandResult(q, { commandId: 'other', deviceId: 'window-1', status: 'EXECUTED' })
    expect(read(q)?.[0]?.status).toBe('APPROVED')
  })
})

describe('startDecisionAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  const toasts = () => useToastStore.getState().toasts.map((t) => t.title)
  const set = (q: QueryClient, d: Decision[]) => q.setQueryData(queryKeys.forecast, forecast(d))

  it('stays quiet about what was already there at first load', () => {
    const q = new QueryClient()
    const stop = startDecisionAlerts(q)
    set(q, [decision(), decision({ id: 'old', status: 'EXECUTED' })])
    expect(toasts()).toEqual([])
    stop()
  })

  it('announces new recommendations and outcomes with device names', () => {
    const q = new QueryClient()
    q.setQueryData(queryKeys.devices, [device])
    set(q, [])
    const stop = startDecisionAlerts(q)
    set(q, [decision()])
    set(q, [decision({ status: 'APPROVED' })])
    set(q, [decision({ status: 'EXECUTED' })])
    expect(toasts()).toEqual(['새 추천: 창문 닫기', '창문 닫기 실행 완료'])
    stop()
  })

  it('announces a result once even if a re-read briefly returns the older status', () => {
    const q = new QueryClient()
    set(q, [decision({ status: 'APPROVED' })])
    const stop = startDecisionAlerts(q)
    set(q, [decision({ status: 'EXECUTED' })])
    set(q, [decision({ status: 'APPROVED' })])
    set(q, [decision({ status: 'EXECUTED' })])
    expect(toasts()).toHaveLength(1)
    stop()
  })

  it('does not announce a recommendation in full-auto, only its outcome', () => {
    const q = new QueryClient()
    const settings: AutomationSettings = { enabled: true, mode: 'AUTO' }
    q.setQueryData(queryKeys.automationSettings, settings)
    set(q, [])
    const stop = startDecisionAlerts(q)
    set(q, [decision()])
    expect(toasts()).toEqual([])
    set(q, [decision({ status: 'FAILED', reason: '모터 과부하' })])
    expect(useToastStore.getState().toasts[0]).toMatchObject({ tone: 'error', detail: '모터 과부하' })
    stop()
  })

  it('stops listening when stopped', () => {
    const q = new QueryClient()
    set(q, [])
    startDecisionAlerts(q)()
    set(q, [decision()])
    expect(toasts()).toEqual([])
  })
})

describe('weather timeline', () => {
  const point = (h: number) => ({ time: iso(NOW + h * HOUR), temp: 20, humidity: 50, precipitationProb: 10 * (h + 3), pm25: null })
  const obs = (h: number) => ({ time: iso(NOW + h * HOUR), temp: 20, humidity: 50, precipitation: 0 })

  it('merges measurements then forecasts, in time order', () => {
    const slots = buildWeatherSlots({ observations: [obs(-1), obs(-2)], weather: [point(1), point(2)] }, NOW)
    expect(slots.map((s) => s.kind)).toEqual(['observed', 'observed', 'forecast', 'forecast'])
    expect(slots.map((s) => s.time)).toEqual([-2, -1, 1, 2].map((h) => NOW + h * HOUR))
  })

  it('prefers a measurement over a forecast for the same or earlier time', () => {
    const slots = buildWeatherSlots({ observations: [obs(-1)], weather: [point(-2), point(-1), point(1)] }, NOW)
    expect(slots.map((s) => [s.kind, s.time])).toEqual([
      ['observed', NOW - HOUR],
      ['forecast', NOW + HOUR],
    ])
  })

  it('works with no measurements', () => {
    expect(buildWeatherSlots({ observations: [], weather: [point(1)] }, NOW)).toHaveLength(1)
  })

  it('trims what is far outside the two-hour window, keeping an hourly reading just past it', () => {
    const slots = buildWeatherSlots({ observations: [obs(-2.5), obs(-5)], weather: [point(2.5), point(12)] }, NOW)
    expect(slots.map((s) => s.time)).toEqual([NOW - 2.5 * HOUR, NOW + 2.5 * HOUR])
  })

  it('labels relative to now', () => {
    expect(slotLabel(NOW + 10 * 60_000, NOW)).toBe('지금')
    expect(slotLabel(NOW - 29 * 60_000, NOW)).toBe('지금')
    expect(slotLabel(NOW + 2 * HOUR, NOW)).toBe('2시간 후')
    expect(slotLabel(NOW - HOUR, NOW)).toBe('1시간 전')
  })

  it('finds the rain peak ahead, ignoring the past and unknown values', () => {
    const slots = buildWeatherSlots(
      { observations: [], weather: [point(-2), point(1), { ...point(2), precipitationProb: null }] },
      NOW,
    )
    expect(peakRainChance(slots, NOW)).toBe(40)
    expect(peakRainChance([], NOW)).toBeNull()
    expect(peakRainChance(buildWeatherSlots({ observations: [obs(1)], weather: [] }, NOW), NOW)).toBeNull()
  })
})

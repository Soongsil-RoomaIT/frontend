import { describe, expect, it, vi } from 'vitest'
import {
  parseCommandAck,
  parseDevice,
  parseDevices,
  parseEdgeStatus,
  parseNotification,
  parseNotifications,
  parseOutdoor,
  parsePrediction,
  parseRecommendation,
  parseRecommendationList,
  parseRecoveryReport,
  parseSensorHistory,
  parseSensorReading,
} from './parsers'

const t = '2026-10-01T10:00:00.000Z'
const unix = Date.parse(t) / 1000

describe('parseSensorReading', () => {
  it('keeps every metric and normalizes the time', () => {
    expect(parseSensorReading({ measuredAt: t, temperature: 24, humidity: 50, co2: 800, pm25: 10, pm10: 20 })).toEqual({
      measuredAt: t,
      temperature: 24,
      humidity: 50,
      co2: 800,
      pm25: 10,
      pm10: 20,
    })
  })

  it('turns null, missing and non-numeric metrics into null (ADR-008), never 0', () => {
    const r = parseSensorReading({ measuredAt: t, temperature: 24.3, humidity: 52.1, co2: null, pm10: 'n/a' })
    expect(r).toEqual({ measuredAt: t, temperature: 24.3, humidity: 52.1, co2: null, pm25: null, pm10: null })
  })

  it.each([
    ['Unix seconds', unix],
    ['Unix seconds with fraction', unix + 0.12],
    ['Unix milliseconds', unix * 1000],
    ['numeric string', String(unix)],
    ['ISO with offset', '2026-10-01T19:00:00+09:00'],
  ])('accepts %s as the time', (_name, value) => {
    const r = parseSensorReading({ measuredAt: value, temperature: 1, humidity: 1 })
    expect(r?.measuredAt.slice(0, 19)).toBe(t.slice(0, 19))
  })

  it('accepts a numeric string as a value', () => {
    expect(parseSensorReading({ measuredAt: t, humidity: '52' })?.humidity).toBe(52)
  })

  it.each([[null], [{}], [{ measuredAt: 'yesterday' }], [[]], ['text']])('rejects %j', (v) => {
    expect(parseSensorReading(v)).toBeNull()
  })
})

describe('parseSensorHistory', () => {
  it('reads points, sorts by time and keeps the bucket', () => {
    const h = parseSensorHistory(
      { bucketSeconds: 300, points: [{ measuredAt: unix + 300, humidity: 51 }, { measuredAt: t, humidity: 50 }] },
      '24h',
    )
    expect(h.bucketSeconds).toBe(300)
    expect(h.points.map((p) => p.humidity)).toEqual([50, 51])
  })

  it('accepts a bare array and drops bad points', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = parseSensorHistory([{ measuredAt: t, humidity: 1 }, { nope: 1 }], '1h')
    expect(h.points).toHaveLength(1)
    expect(h.bucketSeconds).toBeNull()
    warn.mockRestore()
  })
})

describe('parseDevice', () => {
  const device = { id: 'w', type: 'WINDOW', name: '창문', state: 'OPEN', updatedAt: t }

  it('keeps the known fields and the v1.2 state sources', () => {
    expect(parseDevice({ ...device, stateSource: 'COMMANDED', actions: ['OPEN', 'CLOSE'], autoCloseAt: null })).toEqual({
      ...device,
      stateSource: 'COMMANDED',
      actions: ['OPEN', 'CLOSE'],
      autoCloseAt: null,
    })
  })

  it('accepts states and sources this UI has no word for', () => {
    expect(parseDevice({ ...device, state: 'fault' })?.state).toBe('FAULT')
    expect(parseDevice({ ...device, stateSource: 'LIDAR' })?.stateSource).toBe('LIDAR')
  })

  it('drops an unknown action instead of the device', () => {
    expect(parseDevice({ ...device, actions: ['OPEN', 'EXPLODE'] })?.actions).toEqual(['OPEN'])
  })

  it('normalizes snake_case and Unix times', () => {
    const d = parseDevice({ ...device, updated_at: unix, auto_close_at: unix + 600, state_source: 'sensor' })
    expect(d?.updatedAt).toBe(t)
    expect(d?.autoCloseAt).toBe('2026-10-01T10:10:00.000Z')
    expect(d?.stateSource).toBe('SENSOR')
  })

  it('ignores an unparsable autoCloseAt rather than failing the device', () => {
    const d = parseDevice({ ...device, autoCloseAt: 'soon' })
    expect(d).not.toBeNull()
    expect(d?.autoCloseAt).toBeUndefined()
  })

  it.each([
    ['no id', { ...device, id: '' }],
    ['no state', { ...device, state: null }],
    ['no time', { ...device, updatedAt: 'never' }],
    ['no name', { ...device, name: undefined }],
  ])('rejects a device with %s', (_n, v) => {
    expect(parseDevice(v)).toBeNull()
  })

  it('parseDevices keeps the valid ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseDevices([device, {}])).toHaveLength(1)
    expect(() => parseDevices({})).toThrow()
    warn.mockRestore()
  })
})

describe('edge', () => {
  it('parses status with offlineMode defaulting to false', () => {
    expect(parseEdgeStatus({ online: true, lastSeenAt: unix })).toEqual({ online: true, offlineMode: false, lastSeenAt: t })
    expect(parseEdgeStatus({ online: 'yes', lastSeenAt: t })).toBeNull()
  })

  it('parses a recovery report and drops bad local actions', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = parseRecoveryReport({
      offlineSince: t,
      recoveredAt: t,
      localActions: [{ executedAt: t, deviceId: 'd', state: 'on', reason: '습도 72%' }, { executedAt: t }],
    })
    expect(r?.localActions).toEqual([{ executedAt: t, deviceId: 'd', state: 'ON', reason: '습도 72%' }])
    warn.mockRestore()
  })

  it('parses an ack', () => {
    expect(parseCommandAck({ commandId: 1, deviceId: 'w', status: 'executed' })).toEqual({ commandId: '1', deviceId: 'w', status: 'EXECUTED' })
    expect(parseCommandAck({ commandId: 'c', deviceId: 'w', status: 'PENDING' })).toBeNull()
  })
})

describe('parseOutdoor', () => {
  it('reads current values and hourly points', () => {
    const o = parseOutdoor({
      source: 'kma',
      publishedAt: t,
      pm25: 42,
      pm10: null,
      precipitationProb: 80,
      hourly: [{ time: unix + 3600, temp: 20 }, { time: t, temp: 19, pop: 10 }],
    })
    expect(o.pm25).toBe(42)
    expect(o.pm10).toBeNull()
    expect(o.hourly.map((h) => h.temp)).toEqual([19, 20])
    expect(o.hourly[0]?.precipitationProb).toBe(10)
  })

  it('reads values nested under current', () => {
    expect(parseOutdoor({ current: { temperature: 21, humidity: 40 } })).toMatchObject({ temp: 21, humidity: 40, hourly: [] })
  })

  it('gives a bare object empty values', () => {
    expect(parseOutdoor({})).toEqual({
      publishedAt: null,
      fetchedAt: null,
      source: null,
      stale: false,
      message: null,
      temp: null,
      humidity: null,
      precipitationProb: null,
      pm25: null,
      pm10: null,
      hourly: [],
    })
  })

  it.each([[null], [[]], ['x']])('rejects %j', (v) => {
    expect(() => parseOutdoor(v)).toThrow()
  })
})

describe('parsePrediction', () => {
  it('reads one row per metric', () => {
    const p = parsePrediction({
      generatedAt: t,
      targetAt: unix + 3600,
      controlEnabled: true,
      metrics: [
        { metric: 'humidity', predicted: 68, baseline: 62, mae: 2.1, baselineMae: 3.4 },
        { metric: 'temp', predicted: 23.4 },
      ],
    })
    expect(p.targetAt).toBe('2026-10-01T11:00:00.000Z')
    expect(p.controlEnabled).toBe(true)
    expect(p.metrics).toEqual([
      { metric: 'humidity', predicted: 68, baseline: 62, actual: null, mae: 2.1, baselineMae: 3.4 },
      { metric: 'temperature', predicted: 23.4, baseline: null, actual: null, mae: null, baselineMae: null },
    ])
  })

  it('reads metrics keyed by name', () => {
    const p = parsePrediction({ humidity: { value: 70, baseline: 65 }, temperature: { prediction: 22 } })
    expect(p.metrics.map((m) => [m.metric, m.predicted])).toEqual([
      ['humidity', 70],
      ['temperature', 22],
    ])
    expect(p.controlEnabled).toBeNull()
  })

  it('handles no model at all', () => {
    expect(parsePrediction({ message: '모델 없음' })).toMatchObject({ metrics: [], message: '모델 없음' })
  })
})

describe('recommendations', () => {
  const rec = { id: 'r1', metric: 'humidityHigh', current: 70, proposed: 66, status: 'PROPOSED', evidenceCount: 14 }

  it('parses one', () => {
    expect(parseRecommendation(rec)).toMatchObject({ id: 'r1', proposed: 66, evidenceCount: 14, status: 'PROPOSED' })
    expect(parseRecommendation({ ...rec, status: undefined })?.status).toBe('PROPOSED')
    expect(parseRecommendation({ ...rec, proposed: 'x' })).toBeNull()
    expect(parseRecommendation({ ...rec, metric: undefined, ruleId: 'humidityOn' })?.metric).toBe('humidityOn')
  })

  it('reads a bare list or a list with progress', () => {
    expect(parseRecommendationList([rec]).items).toHaveLength(1)
    const l = parseRecommendationList({ items: [], progress: { count: 4, required: 10 } })
    expect(l.progress).toEqual({ count: 4, required: 10 })
    expect(parseRecommendationList({ items: [], progress: { count: 4 } }).progress).toBeNull()
    expect(parseRecommendationList(null).items).toEqual([])
  })
})

describe('notifications', () => {
  it('reads the gateway shape', () => {
    expect(parseNotification({ id: 'n1', title: '자동 제어 완료', body: '제습기를 켰습니다', createdAt: t, data: { deviceId: 'd' } })).toEqual({
      id: 'n1',
      title: '자동 제어 완료',
      body: '제습기를 켰습니다',
      createdAt: t,
      read: null,
      data: { deviceId: 'd' },
    })
  })

  it('reads the cloud-server shape (message + read)', () => {
    expect(parseNotification({ id: 'n2', message: '엣지 연결 복구', read: false, createdAt: unix })).toMatchObject({
      body: '엣지 연결 복구',
      title: null,
      read: false,
      createdAt: t,
    })
  })

  it('needs an id and some text', () => {
    expect(parseNotification({ id: 'n', createdAt: t })).toBeNull()
    expect(parseNotification({ title: 'x' })).toBeNull()
  })

  it('sorts newest first, undated last', () => {
    const list = parseNotifications([
      { id: 'a', body: 'a', createdAt: t },
      { id: 'b', body: 'b' },
      { id: 'c', body: 'c', createdAt: unix + 60 },
    ])
    expect(list.map((n) => n.id)).toEqual(['c', 'a', 'b'])
  })
})

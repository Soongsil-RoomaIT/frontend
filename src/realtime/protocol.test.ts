import { describe, expect, it } from 'vitest'
import { parseServerMessage } from './protocol'

const t = '2026-10-01T10:00:00.000Z'
const reading = { measuredAt: t, temperature: 24, humidity: 50, co2: 800, pm25: 10, pm10: 20 }
const device = { id: 'w', type: 'WINDOW', name: '창문', state: 'OPEN', updatedAt: t }
const frame = (v: unknown) => JSON.stringify(v)

describe('parseServerMessage', () => {
  it.each([
    ['sensor.update', reading],
    ['device.state', device],
    ['device.state', { ...device, stateSource: 'COMMANDED', actions: ['OPEN', 'CLOSE'], autoCloseAt: null }],
    ['edge.status', { online: false, offlineMode: false, lastSeenAt: t }],
    ['edge.recovered', { offlineSince: t, recoveredAt: t, localActions: [] }],
    [
      'edge.recovered',
      { offlineSince: t, recoveredAt: t, localActions: [{ executedAt: t, deviceId: 'w', state: 'OPEN', reason: 'x' }] },
    ],
    ['command.ack', { commandId: 'c1', deviceId: 'w', status: 'EXECUTED' }],
    ['command.ack', { commandId: 'c1', deviceId: 'w', status: 'FAILED', reason: '과부하', device }],
    ['recommendation.new', { id: 'r1', metric: 'humidityHigh', current: 70, proposed: 66, status: 'PROPOSED', evidenceCount: 14, reason: null, createdAt: t, appliedAt: null }],
    ['notification.new', { id: 'n1', title: '제습기 켜기', body: '습도 72%', createdAt: t, read: false, data: {} }],
  ])('accepts a valid %s as is', (type, payload) => {
    expect(parseServerMessage(frame({ type, payload }))).toEqual({ type, payload })
  })

  it('normalizes what it accepts', () => {
    const m = parseServerMessage(frame({ type: 'sensor.update', payload: { measuredAt: Date.parse(t) / 1000, temperature: 24.3, humidity: 52.1, co2: null } }))
    expect(m).toEqual({ type: 'sensor.update', payload: { measuredAt: t, temperature: 24.3, humidity: 52.1, co2: null, pm25: null, pm10: null } })
  })

  it('accepts a prediction and a bare heartbeat', () => {
    const p = parseServerMessage(frame({ type: 'forecast.update', payload: { metrics: [{ metric: 'humidity', predicted: 70 }] } }))
    expect(p?.type).toBe('forecast.update')
    expect(parseServerMessage(frame({ type: 'heartbeat' }))).toEqual({ type: 'heartbeat', payload: {} })
  })

  it.each([
    ['unknown type', { type: 'foo', payload: {} }],
    ['prototype key as type', { type: 'toString', payload: {} }],
    ['missing payload', { type: 'sensor.update' }],
    ['bad timestamp', { type: 'sensor.update', payload: { ...reading, measuredAt: 'yesterday' } }],
    ['device without state', { type: 'device.state', payload: { ...device, state: '' } }],
    ['empty device type', { type: 'device.state', payload: { ...device, type: '' } }],
    ['ack with PENDING status', { type: 'command.ack', payload: { commandId: 'c', deviceId: 'w', status: 'PENDING' } }],
    ['recommendation without value', { type: 'recommendation.new', payload: { id: 'r', metric: 'x' } }],
    ['notification without text', { type: 'notification.new', payload: { id: 'n' } }],
    ['prediction that is not an object', { type: 'forecast.update', payload: [] }],
    ['array root', [1, 2]],
    ['null root', null],
  ])('rejects %s', (_name, value) => {
    expect(parseServerMessage(frame(value))).toBeNull()
  })

  it('tolerates a bad local action inside an otherwise fine report', () => {
    const m = parseServerMessage(frame({ type: 'edge.recovered', payload: { offlineSince: t, recoveredAt: t, localActions: [{ executedAt: t }] } }))
    expect(m?.type).toBe('edge.recovered')
  })

  it('rejects __proto__ as a type', () => {
    expect(parseServerMessage('{"type":"__proto__","payload":{}}')).toBeNull()
  })

  it.each(['not json', '', '{"type":', '123', '"str"'])('rejects raw frame %j', (raw) => {
    expect(parseServerMessage(raw)).toBeNull()
  })
})

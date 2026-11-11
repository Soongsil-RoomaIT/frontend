import { describe, expect, it } from 'vitest'
import { isDevice, parseServerMessage } from './protocol'

const t = '2026-10-01T10:00:00.000Z'
const reading = { measuredAt: t, temperature: 24, humidity: 50, co2: 800, pm25: 10, pm10: 20 }
const device = { id: 'w', type: 'WINDOW', name: '창문', state: 'OPEN', updatedAt: t }
const frame = (v: unknown) => JSON.stringify(v)

describe('parseServerMessage', () => {
  it.each([
    ['sensor.update', reading],
    ['device.state', device],
    ['edge.status', { online: false, offlineMode: false, lastSeenAt: t }],
    ['edge.recovered', { offlineSince: t, recoveredAt: t, localActions: [] }],
    [
      'edge.recovered',
      { offlineSince: t, recoveredAt: t, localActions: [{ executedAt: t, deviceId: 'w', state: 'OPEN', reason: 'x' }] },
    ],
    ['command.ack', { commandId: 'c1', deviceId: 'w', status: 'EXECUTED' }],
    ['command.ack', { commandId: 'c1', deviceId: 'w', status: 'FAILED', reason: '과부하', device }],
    ['heartbeat', undefined],
    ['decision.proposed', { id: 'd1', deviceId: 'w', action: 'CLOSE', status: 'PROPOSED' }],
    [
      'decision.updated',
      {
        id: 'd1',
        deviceId: 'w',
        action: 'CLOSE',
        status: 'NEW_STATUS',
        reasons: [{ factor: '강수확률', value: 80, threshold: null }],
        createdAt: t,
        commandId: 'c1',
      },
    ],
  ])('accepts a valid %s', (type, payload) => {
    expect(parseServerMessage(frame({ type, payload }))).toEqual({ type, payload })
  })

  it.each([
    ['unknown type', { type: 'foo', payload: {} }],
    ['decision without id', { type: 'decision.proposed', payload: { deviceId: 'w', action: 'CLOSE', status: 'PROPOSED' } }],
    ['decision with unknown action', { type: 'decision.updated', payload: { id: 'd', deviceId: 'w', action: 'FLY', status: 'PROPOSED' } }],
    ['decision with bad reason', { type: 'decision.proposed', payload: { id: 'd', deviceId: 'w', action: 'CLOSE', status: 'PROPOSED', reasons: [{ factor: 1 }] } }],
    ['prototype key as type', { type: 'toString', payload: {} }],
    ['missing payload', { type: 'sensor.update' }],
    ['number as string', { type: 'sensor.update', payload: { ...reading, co2: '800' } }],
    ['null value', { type: 'sensor.update', payload: { ...reading, co2: null } }],
    ['bad timestamp', { type: 'sensor.update', payload: { ...reading, measuredAt: 'yesterday' } }],
    ['bad device state', { type: 'device.state', payload: { ...device, state: 'HALF' } }],
    ['empty device type', { type: 'device.state', payload: { ...device, type: '' } }],
    ['bad action list', { type: 'device.state', payload: { ...device, actions: ['OPEN', 'EXPLODE'] } }],
    ['bad stateSource', { type: 'device.state', payload: { ...device, stateSource: 'GUESS' } }],
    ['bad autoCloseAt', { type: 'device.state', payload: { ...device, autoCloseAt: 'soon' } }],
    ['bad local action', { type: 'edge.recovered', payload: { offlineSince: t, recoveredAt: t, localActions: [{ executedAt: t }] } }],
    ['ack with PENDING status', { type: 'command.ack', payload: { commandId: 'c', deviceId: 'w', status: 'PENDING' } }],
    ['ack with bad device', { type: 'command.ack', payload: { commandId: 'c', deviceId: 'w', status: 'EXECUTED', device: {} } }],
    ['array root', [1, 2]],
    ['null root', null],
  ])('rejects %s', (_name, value) => {
    expect(parseServerMessage(frame(value))).toBeNull()
  })

  it('rejects __proto__ as a type', () => {
    expect(parseServerMessage('{"type":"__proto__","payload":{}}')).toBeNull()
  })

  it.each(['not json', '', '{"type":', '123', '"str"'])('rejects raw frame %j', (raw) => {
    expect(parseServerMessage(raw)).toBeNull()
  })
})

describe('isDevice', () => {
  it('accepts an unknown device type, since the hardware lineup may change', () => {
    expect(isDevice({ ...device, type: 'HUMIDIFIER', state: 'ON' })).toBe(true)
  })

  it('accepts all optional fields when valid', () => {
    expect(
      isDevice({ ...device, actions: [], stateSource: 'ASSUMED', autoCloseAt: null }),
    ).toBe(true)
    expect(isDevice({ ...device, autoCloseAt: t })).toBe(true)
  })
})

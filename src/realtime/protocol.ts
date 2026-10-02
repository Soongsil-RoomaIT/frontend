import type { Device, DeviceState, EdgeRecoveryReport, EdgeStatus, LocalAction, SensorReading } from '@/api/types'

/**
 * Messages pushed by the cloud server over WebSocket.
 * Envelope: `{ "type": string, "payload": object }`, JSON-encoded text frames.
 */
export type ServerMessage =
  | { type: 'sensor.update'; payload: SensorReading }
  | { type: 'device.state'; payload: Device }
  | { type: 'edge.status'; payload: EdgeStatus }
  | { type: 'edge.recovered'; payload: EdgeRecoveryReport }

type Guard<T> = (value: unknown) => value is T

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isTimestamp = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const isString = (v: unknown): v is string => typeof v === 'string'

const DEVICE_TYPES = new Set(['WINDOW', 'DEHUMIDIFIER', 'AIR_PURIFIER', 'FRONT_DOOR'])
const DEVICE_STATES = new Set(['OPEN', 'CLOSED', 'ON', 'OFF'])
const isDeviceState = (v: unknown): v is DeviceState => isString(v) && DEVICE_STATES.has(v)

export const isSensorReading: Guard<SensorReading> = (v): v is SensorReading =>
  isRecord(v) &&
  isTimestamp(v.measuredAt) &&
  isFiniteNumber(v.temperature) &&
  isFiniteNumber(v.humidity) &&
  isFiniteNumber(v.co2) &&
  isFiniteNumber(v.pm25) &&
  isFiniteNumber(v.pm10)

const isDevice: Guard<Device> = (v): v is Device =>
  isRecord(v) &&
  isString(v.id) &&
  isString(v.type) &&
  DEVICE_TYPES.has(v.type) &&
  isString(v.name) &&
  isDeviceState(v.state) &&
  isTimestamp(v.updatedAt)

const isEdgeStatus: Guard<EdgeStatus> = (v): v is EdgeStatus =>
  isRecord(v) && typeof v.online === 'boolean' && typeof v.offlineMode === 'boolean' && isTimestamp(v.lastSeenAt)

const isLocalAction: Guard<LocalAction> = (v): v is LocalAction =>
  isRecord(v) && isTimestamp(v.executedAt) && isString(v.deviceId) && isDeviceState(v.state) && isString(v.reason)

const isRecoveryReport: Guard<EdgeRecoveryReport> = (v): v is EdgeRecoveryReport =>
  isRecord(v) &&
  isTimestamp(v.offlineSince) &&
  isTimestamp(v.recoveredAt) &&
  Array.isArray(v.localActions) &&
  v.localActions.every(isLocalAction)

const payloadGuards: { [K in ServerMessage['type']]: Guard<Extract<ServerMessage, { type: K }>['payload']> } = {
  'sensor.update': isSensorReading,
  'device.state': isDevice,
  'edge.status': isEdgeStatus,
  'edge.recovered': isRecoveryReport,
}

/**
 * Parses a raw text frame. Returns null for malformed JSON, unknown message types
 * (ignored so the server can add new types without breaking older clients),
 * or payloads that don't match the contract.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || !isString(data.type) || !Object.hasOwn(payloadGuards, data.type)) return null

  const type = data.type as ServerMessage['type']
  const guard = payloadGuards[type] as Guard<unknown>
  return guard(data.payload) ? ({ type, payload: data.payload } as ServerMessage) : null
}

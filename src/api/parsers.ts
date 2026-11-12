import { toIso } from '@/lib/time'
import type {
  AppNotification,
  CommandAck,
  Device,
  DeviceAction,
  EdgeRecoveryReport,
  EdgeStatus,
  LocalAction,
  Outdoor,
  OutdoorHour,
  Prediction,
  PredictionMetric,
  Recommendation,
  RecommendationList,
  SensorHistory,
  SensorReading,
} from './types'

/**
 * The only place that knows what the server's JSON looks like. Everything here is forgiving on
 * purpose: a backend still in progress should degrade one field ("정보 없음"), not blank a screen.
 * Field names are accepted in a few common spellings; a renamed field is a one-line change here.
 */

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const isString = (v: unknown): v is string => typeof v === 'string'

export const numberOrNull = (v: unknown): number | null => {
  if (isFiniteNumber(v)) return v
  // Numbers that went through a text column
  if (isString(v) && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}
export const stringOrNull = (v: unknown) => (isString(v) && v.trim() !== '' ? v.trim() : null)
export const boolOrNull = (v: unknown) => (typeof v === 'boolean' ? v : null)
const idOf = (v: unknown): string | null => (isString(v) && v !== '' ? v : isFiniteNumber(v) ? String(v) : null)

/** First present key wins, so a server can use either spelling */
function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (Object.hasOwn(record, key) && record[key] !== undefined) return record[key]
  return undefined
}

/** Parses each item, keeps the valid ones and warns (dev) about the rest */
export function validOnly<T>(raw: unknown, parse: (item: unknown) => T | null, what: string): T[] {
  if (!Array.isArray(raw)) return []
  const parsed = raw.map(parse)
  const valid = parsed.filter((item): item is T => item !== null)
  if (import.meta.env.DEV && valid.length !== raw.length) {
    console.warn(`[api] Ignored malformed ${what}`, raw.filter((_, i) => parsed[i] === null))
  }
  return valid
}

// ---- Sensors ----

export function parseSensorReading(v: unknown): SensorReading | null {
  if (!isRecord(v)) return null
  const measuredAt = toIso(pick(v, 'measuredAt', 'measured_at', 'time', 'timestamp'))
  if (!measuredAt) return null
  return {
    measuredAt,
    temperature: numberOrNull(v.temperature),
    humidity: numberOrNull(v.humidity),
    co2: numberOrNull(v.co2),
    pm25: numberOrNull(pick(v, 'pm25', 'pm2_5')),
    pm10: numberOrNull(v.pm10),
  }
}

export function parseSensorHistory(v: unknown, range: SensorHistory['range']): SensorHistory {
  // A bare array is accepted too
  const record = isRecord(v) ? v : { points: v }
  const points = validOnly(pick(record, 'points', 'items', 'data'), parseSensorReading, 'history points')
  points.sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt))
  return { range, bucketSeconds: numberOrNull(pick(record, 'bucketSeconds', 'bucket_seconds')), points }
}

// ---- Devices ----

const DEVICE_ACTIONS = new Set<string>(['OPEN', 'CLOSE', 'ON', 'OFF'])
export const isDeviceAction = (v: unknown): v is DeviceAction => isString(v) && DEVICE_ACTIONS.has(v)

export function parseDevice(v: unknown): Device | null {
  if (!isRecord(v)) return null
  const id = idOf(v.id)
  const type = stringOrNull(v.type)
  const state = stringOrNull(v.state)
  const updatedAt = toIso(pick(v, 'updatedAt', 'updated_at'))
  if (!id || !type || !state || !updatedAt || !isString(v.name)) return null

  const device: Device = { id, type, name: v.name, state: state.toUpperCase(), updatedAt }
  const actions = pick(v, 'actions')
  // An action this UI can't name is dropped rather than failing the device; the rest still work
  if (Array.isArray(actions)) device.actions = actions.filter(isDeviceAction)
  const source = stringOrNull(pick(v, 'stateSource', 'state_source'))
  if (source) device.stateSource = source.toUpperCase()
  const autoClose = pick(v, 'autoCloseAt', 'auto_close_at')
  if (autoClose === null) device.autoCloseAt = null
  else if (autoClose !== undefined) {
    const iso = toIso(autoClose)
    if (iso) device.autoCloseAt = iso
  }
  return device
}

export function parseDevices(v: unknown): Device[] {
  if (!Array.isArray(v)) throw new Error('Expected an array of devices')
  return validOnly(v, parseDevice, 'devices')
}

// ---- Edge ----

export function parseEdgeStatus(v: unknown): EdgeStatus | null {
  if (!isRecord(v)) return null
  const lastSeenAt = toIso(pick(v, 'lastSeenAt', 'last_seen_at'))
  if (typeof v.online !== 'boolean' || !lastSeenAt) return null
  return { online: v.online, offlineMode: pick(v, 'offlineMode', 'offline_mode') === true, lastSeenAt }
}

function parseLocalAction(v: unknown): LocalAction | null {
  if (!isRecord(v)) return null
  const executedAt = toIso(pick(v, 'executedAt', 'executed_at'))
  const deviceId = idOf(pick(v, 'deviceId', 'device_id'))
  const state = stringOrNull(v.state)
  if (!executedAt || !deviceId || !state) return null
  return { executedAt, deviceId, state: state.toUpperCase(), reason: stringOrNull(v.reason) ?? '' }
}

export function parseRecoveryReport(v: unknown): EdgeRecoveryReport | null {
  if (!isRecord(v)) return null
  const offlineSince = toIso(pick(v, 'offlineSince', 'offline_since'))
  const recoveredAt = toIso(pick(v, 'recoveredAt', 'recovered_at'))
  if (!offlineSince || !recoveredAt) return null
  return { offlineSince, recoveredAt, localActions: validOnly(pick(v, 'localActions', 'local_actions'), parseLocalAction, 'local actions') }
}

export function parseCommandAck(v: unknown): CommandAck | null {
  if (!isRecord(v)) return null
  const commandId = idOf(pick(v, 'commandId', 'command_id'))
  const deviceId = idOf(pick(v, 'deviceId', 'device_id'))
  const status = isString(v.status) ? v.status.toUpperCase() : ''
  if (!commandId || !deviceId || (status !== 'EXECUTED' && status !== 'FAILED')) return null
  const ack: CommandAck = { commandId, deviceId, status }
  const reason = stringOrNull(v.reason)
  if (reason) ack.reason = reason
  const device = parseDevice(v.device)
  if (device) ack.device = device
  return ack
}

// ---- Outdoor ----

function parseOutdoorHour(v: unknown): OutdoorHour | null {
  if (!isRecord(v)) return null
  const time = toIso(pick(v, 'time', 'at', 'forecastAt'))
  if (!time) return null
  return {
    time,
    temp: numberOrNull(pick(v, 'temp', 'temperature')),
    humidity: numberOrNull(v.humidity),
    precipitationProb: numberOrNull(pick(v, 'precipitationProb', 'pop', 'rainProbability')),
    pm25: numberOrNull(pick(v, 'pm25', 'pm2_5')),
    pm10: numberOrNull(v.pm10),
  }
}

export function parseOutdoor(v: unknown): Outdoor {
  if (!isRecord(v)) throw new Error('Expected an outdoor object')
  // Current values may be nested under `current` or at the top level
  const current = isRecord(v.current) ? v.current : v
  const hourly = validOnly(pick(v, 'hourly', 'forecast', 'weather'), parseOutdoorHour, 'outdoor hours')
  hourly.sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  return {
    publishedAt: toIso(pick(v, 'publishedAt', 'published_at', 'baseTime', 'observedAt', 'updatedAt')),
    fetchedAt: toIso(pick(v, 'fetchedAt', 'fetched_at')),
    source: stringOrNull(v.source),
    stale: v.stale === true,
    message: stringOrNull(v.message),
    temp: numberOrNull(pick(current, 'temp', 'temperature')),
    humidity: numberOrNull(current.humidity),
    precipitationProb: numberOrNull(pick(current, 'precipitationProb', 'pop', 'rainProbability')),
    pm25: numberOrNull(pick(current, 'pm25', 'pm2_5')),
    pm10: numberOrNull(current.pm10),
    hourly,
  }
}

// ---- Prediction ----

const METRIC_ALIASES: Record<string, string> = { temp: 'temperature', rh: 'humidity' }
const normalizeMetric = (name: string) => {
  const key = name.trim().toLowerCase()
  return Object.hasOwn(METRIC_ALIASES, key) ? METRIC_ALIASES[key]! : key
}

function parsePredictionMetric(metric: string, v: unknown): PredictionMetric | null {
  if (!isRecord(v)) return null
  return {
    metric,
    predicted: numberOrNull(pick(v, 'predicted', 'value', 'prediction')),
    baseline: numberOrNull(v.baseline),
    actual: numberOrNull(v.actual),
    mae: numberOrNull(pick(v, 'mae', 'modelMae', 'model_mae')),
    baselineMae: numberOrNull(pick(v, 'baselineMae', 'baseline_mae')),
  }
}

/**
 * Accepts either `{ humidity: {...}, temperature: {...} }` or `metrics: [{ metric, ... }]`
 * (one row per PREDICTION record, as the ERD suggests).
 */
export function parsePrediction(v: unknown): Prediction {
  if (!isRecord(v)) throw new Error('Expected a prediction object')
  const metrics: PredictionMetric[] = []
  const rows = pick(v, 'metrics', 'predictions', 'items')
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!isRecord(row)) continue
      const name = stringOrNull(pick(row, 'metric', 'name'))
      const parsed = name && parsePredictionMetric(normalizeMetric(name), row)
      if (parsed) metrics.push(parsed)
    }
  }
  for (const key of Object.keys(v)) {
    const name = normalizeMetric(key)
    if ((name === 'humidity' || name === 'temperature') && !metrics.some((m) => m.metric === name)) {
      const parsed = parsePredictionMetric(name, v[key])
      if (parsed) metrics.push(parsed)
    }
  }
  const control = pick(v, 'controlEnabled', 'control_enabled', 'predictiveControl')
  return {
    generatedAt: toIso(pick(v, 'generatedAt', 'generated_at', 'createdAt', 'updatedAt')),
    targetAt: toIso(pick(v, 'targetAt', 'target_at', 'targetTime', 'target_time')),
    controlEnabled: boolOrNull(control),
    modelVersion: stringOrNull(pick(v, 'modelVersion', 'model_version')),
    message: stringOrNull(v.message),
    metrics,
  }
}

// ---- Recommendations ----

export function parseRecommendation(v: unknown): Recommendation | null {
  if (!isRecord(v)) return null
  const id = idOf(pick(v, 'id', 'recId', 'rec_id'))
  const metric = stringOrNull(pick(v, 'metric', 'ruleId', 'rule_id', 'key'))
  const proposed = numberOrNull(pick(v, 'proposed', 'recommended', 'value'))
  const status = stringOrNull(v.status)
  if (!id || !metric || proposed === null) return null
  return {
    id,
    metric,
    current: numberOrNull(v.current),
    proposed,
    status: (status ?? 'PROPOSED').toUpperCase(),
    evidenceCount: numberOrNull(pick(v, 'evidenceCount', 'evidence_count', 'evidence', 'sampleCount')),
    reason: stringOrNull(pick(v, 'reason', 'basis')),
    createdAt: toIso(pick(v, 'createdAt', 'created_at')),
    appliedAt: toIso(pick(v, 'appliedAt', 'applied_at')),
  }
}

/** Accepts a bare array or `{ items, progress: { count, required } }` */
export function parseRecommendationList(v: unknown): RecommendationList {
  const record = isRecord(v) ? v : { items: v }
  const items = validOnly(pick(record, 'items', 'recommendations'), parseRecommendation, 'recommendations')
  const progressRaw = pick(record, 'progress', 'collecting')
  let progress: RecommendationList['progress'] = null
  if (isRecord(progressRaw)) {
    const count = numberOrNull(pick(progressRaw, 'count', 'collected', 'current'))
    const required = numberOrNull(pick(progressRaw, 'required', 'needed', 'target'))
    if (count !== null && required !== null && required > 0) progress = { count: Math.max(0, count), required }
  }
  return { items, progress }
}

// ---- Notifications ----

export function parseNotification(v: unknown): AppNotification | null {
  if (!isRecord(v)) return null
  const id = idOf(pick(v, 'id', 'notificationId', 'eventId'))
  const body = stringOrNull(pick(v, 'body', 'message', 'text'))
  const title = stringOrNull(v.title)
  if (!id || (!body && !title)) return null
  const data = pick(v, 'data', 'meta')
  return {
    id,
    title,
    body: body ?? title ?? '',
    createdAt: toIso(pick(v, 'createdAt', 'created_at', 'time', 'timestamp')),
    read: boolOrNull(pick(v, 'read', 'isRead')),
    data: isRecord(data) ? data : {},
  }
}

export function parseNotifications(v: unknown): AppNotification[] {
  const rows = isRecord(v) ? pick(v, 'items', 'notifications') : v
  const items = validOnly(rows, parseNotification, 'notifications')
  // Newest first; undated ones keep the server's order at the end
  const ms = (n: AppNotification) => (n.createdAt === null ? -Infinity : Date.parse(n.createdAt))
  return items.sort((a, b) => {
    const [x, y] = [ms(a), ms(b)]
    return x === y ? 0 : y > x ? 1 : -1
  })
}

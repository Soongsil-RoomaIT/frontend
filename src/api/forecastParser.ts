import { isDecision, isFiniteNumber, isRecord, isString, isTimestamp } from '@/realtime/protocol'
import type {
  AutomationSettings,
  Decision,
  Forecast,
  WeatherForecastPoint,
  WeatherObservation,
} from './types'

/**
 * The only place that knows the server's forecast and settings format. If the backend changes
 * a field name or moves something, this file (and endpoints.ts for paths) is what changes.
 *
 * Deliberately forgiving: a missing value becomes "no data" and one bad record is dropped,
 * so a backend still in progress degrades one field rather than blanking the whole screen.
 */

const numberOrNull = (v: unknown) => (isFiniteNumber(v) ? v : null)
const stringOrNull = (v: unknown) => (isString(v) && v.trim() !== '' ? v : null)

function validOnly<T>(raw: unknown, parse: (item: unknown) => T | null, what: string): T[] {
  if (!Array.isArray(raw)) return []
  const parsed = raw.map(parse)
  const valid = parsed.filter((item) => item !== null)
  if (import.meta.env.DEV && valid.length !== raw.length) {
    console.warn(`[api] Ignored malformed ${what}`, raw.filter((_, i) => parsed[i] === null))
  }
  return valid
}

const parseWeatherPoint = (v: unknown): WeatherForecastPoint | null =>
  isRecord(v) && isTimestamp(v.time)
    ? {
        time: v.time,
        temp: numberOrNull(v.temp),
        humidity: numberOrNull(v.humidity),
        precipitationProb: numberOrNull(v.precipitationProb),
        pm25: numberOrNull(v.pm25),
      }
    : null

const parseObservation = (v: unknown): WeatherObservation | null =>
  isRecord(v) && isTimestamp(v.time)
    ? {
        time: v.time,
        temp: numberOrNull(v.temp),
        humidity: numberOrNull(v.humidity),
        precipitation: numberOrNull(v.precipitation),
      }
    : null

const parseDecision = (v: unknown): Decision | null => (isDecision(v) ? v : null)

export function parseForecast(data: unknown): Forecast {
  if (!isRecord(data)) throw new Error('Expected a forecast object')
  return {
    source: stringOrNull(data.source),
    updatedAt: isTimestamp(data.updatedAt) ? data.updatedAt : null,
    stale: data.stale === true,
    message: stringOrNull(data.message),
    weather: validOnly(data.weather, parseWeatherPoint, 'weather points'),
    observations: validOnly(data.observations, parseObservation, 'observations'),
    decisions: validOnly(data.decisions, parseDecision, 'decisions'),
  }
}

export const isAutomationSettings = (v: unknown): v is AutomationSettings =>
  isRecord(v) && typeof v.enabled === 'boolean' && (v.mode === 'AUTO' || v.mode === 'APPROVAL')

/** Thresholds stay optional: the settings screen only offers the ones the server actually has. */
export function parseAutomationSettings(data: unknown): AutomationSettings {
  if (!isAutomationSettings(data)) throw new Error('Expected automation settings')
  return data
}

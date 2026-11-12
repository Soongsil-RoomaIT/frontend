import { boolOrNull, isRecord, numberOrNull, stringOrNull } from '@/api/parsers'
import type { Automation, AutomationRule } from '@/api/types'

/**
 * The automation config in the two shapes a server is likely to use, and how to write changes
 * back in the same shape:
 *
 *   rules shape  { enabled?, rules: [{ id, metric, threshold, enabled?, label?, unit?, min?, max? }] }
 *                (or a bare array of rules)             ← AUTOMATION table rows, SAD v1.2 ERD
 *   flat shape   { enabled?, humidityOn: 65, pm25On: 35, ... }   ← one key per threshold
 *
 * Unknown fields are preserved on save. A third shape is a new branch here, nothing else changes.
 */

/** What the frontend knows about rule keys the server may use; server-provided details win */
export interface RuleInfo {
  label: string
  description: string
  unit: string
  min: number
  max: number
}

const catalog: Record<string, RuleInfo> = {
  humidityHigh: { label: '습도 상한', description: '실내 습도가 이 값을 넘으면 환기하거나 제습기를 켭니다', unit: '%', min: 30, max: 95 },
  humidityOn: { label: '제습기 켜기', description: '실내 습도가 이 값 이상이면', unit: '%', min: 30, max: 95 },
  humidityLow: { label: '제습기 끄기', description: '실내 습도가 이 값 아래로 내려가면', unit: '%', min: 20, max: 90 },
  humidityOff: { label: '제습기 끄기', description: '실내 습도가 이 값 이하이면', unit: '%', min: 20, max: 90 },
  temperatureHigh: { label: '온도 상한', description: '실내 온도가 이 값을 넘으면 환기합니다', unit: '°C', min: 15, max: 40 },
  pm25Bad: { label: '초미세먼지 나쁨', description: '외기 PM2.5가 이 값을 넘으면 창문을 닫고 공기청정기를 켭니다', unit: 'µg/m³', min: 1, max: 500 },
  pm25On: { label: '초미세먼지 나쁨', description: '외기 PM2.5가 이 값을 넘으면 창문을 닫고 공기청정기를 켭니다', unit: 'µg/m³', min: 1, max: 500 },
  pm10Bad: { label: '미세먼지 나쁨', description: '외기 PM10이 이 값을 넘으면 창문을 닫고 공기청정기를 켭니다', unit: 'µg/m³', min: 1, max: 1000 },
  rainProbability: { label: '비 예보', description: '강수확률이 이 값 이상이면 창문을 열지 않습니다', unit: '%', min: 0, max: 100 },
  co2Open: { label: '환기 (CO₂)', description: '실내 CO₂가 이 값 이상이면 창문을 엽니다', unit: 'ppm', min: 400, max: 5000 },
}

/** Pairs where the first must stay above the second (hysteresis), by rule id */
const orderedPairs: [high: string, low: string][] = [
  ['humidityHigh', 'humidityLow'],
  ['humidityOn', 'humidityOff'],
]

/** Top-level keys of the flat shape that are not thresholds */
const FLAT_RESERVED = new Set(['enabled', 'mode', 'updatedAt', 'updated_at', 'id', 'roomId', 'room_id'])

export const ruleInfo = (id: string): RuleInfo | undefined => (Object.hasOwn(catalog, id) ? catalog[id] : undefined)

function parseRule(v: unknown): AutomationRule | null {
  if (!isRecord(v)) return null
  const id = stringOrNull(v.id) ?? stringOrNull(v.ruleId) ?? stringOrNull(v.rule_id) ?? stringOrNull(v.metric)
  const threshold = numberOrNull(v.threshold)
  if (!id || threshold === null) return null
  return {
    id,
    metric: stringOrNull(v.metric) ?? id,
    threshold,
    enabled: boolOrNull(v.enabled),
    label: stringOrNull(v.label) ?? stringOrNull(v.name),
    description: stringOrNull(v.description),
    unit: stringOrNull(v.unit),
    min: numberOrNull(v.min),
    max: numberOrNull(v.max),
  }
}

type Shape = 'rules' | 'rules-array' | 'flat'

function shapeOf(raw: unknown): Shape {
  if (Array.isArray(raw)) return 'rules-array'
  if (isRecord(raw) && Array.isArray(raw.rules)) return 'rules'
  return 'flat'
}

export function parseAutomation(raw: unknown): Automation {
  const shape = shapeOf(raw)
  if (shape === 'rules-array') {
    return { enabled: null, rules: (raw as unknown[]).map(parseRule).filter((r) => r !== null), raw }
  }
  if (!isRecord(raw)) throw new Error('Expected an automation object')
  if (shape === 'rules') {
    const rules = (raw.rules as unknown[]).map(parseRule).filter((r) => r !== null)
    return { enabled: boolOrNull(raw.enabled), rules, raw }
  }
  const rules: AutomationRule[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (FLAT_RESERVED.has(key)) continue
    const threshold = numberOrNull(value)
    if (threshold === null || typeof value === 'boolean') continue
    rules.push({ id: key, metric: key, threshold, enabled: null, label: null, description: null, unit: null, min: null, max: null })
  }
  return { enabled: boolOrNull(raw.enabled), rules, raw }
}

/** Display details for a rule: the server's, else the catalog's, else the id itself */
export function describeRule(rule: AutomationRule) {
  const info = ruleInfo(rule.id) ?? ruleInfo(rule.metric)
  return {
    label: rule.label ?? info?.label ?? rule.id,
    description: rule.description ?? info?.description ?? null,
    unit: rule.unit ?? info?.unit ?? '',
    min: rule.min ?? info?.min ?? null,
    max: rule.max ?? info?.max ?? null,
  }
}

export interface AutomationChange {
  enabled?: boolean
  /** Per-rule updates by rule id */
  rules?: Record<string, { threshold?: number; enabled?: boolean }>
}

/** The PUT body: the server's own shape with the changes written in and everything else kept */
export function applyAutomationChange(automation: Automation, change: AutomationChange): unknown {
  const shape = shapeOf(automation.raw)
  const updates = change.rules ?? {}
  const patchRule = (row: unknown) => {
    if (!isRecord(row)) return row
    const parsed = parseRule(row)
    const update = parsed && Object.hasOwn(updates, parsed.id) ? updates[parsed.id] : undefined
    if (!update) return row
    const next = { ...row }
    if (update.threshold !== undefined) next.threshold = update.threshold
    if (update.enabled !== undefined && typeof row.enabled === 'boolean') next.enabled = update.enabled
    return next
  }

  if (shape === 'rules-array') return (automation.raw as unknown[]).map(patchRule)
  const raw = automation.raw as Record<string, unknown>
  const body: Record<string, unknown> = { ...raw }
  if (change.enabled !== undefined && automation.enabled !== null) body.enabled = change.enabled
  if (shape === 'rules') {
    body.rules = (raw.rules as unknown[]).map(patchRule)
  } else {
    for (const [id, update] of Object.entries(updates)) {
      if (update.threshold !== undefined && Object.hasOwn(raw, id)) body[id] = update.threshold
    }
  }
  return body
}

export type RuleErrors = Record<string, string>

/** Validates edited thresholds (strings from inputs) against ranges and hysteresis pairs */
export function validateRules(rules: readonly AutomationRule[], input: Record<string, string>) {
  const values: Record<string, number> = {}
  const errors: RuleErrors = {}
  const byId = new Map(rules.map((r) => [r.id, r]))

  for (const [id, raw] of Object.entries(input)) {
    const rule = byId.get(id)
    if (!rule) continue
    const { min, max } = describeRule(rule)
    const value = raw.trim() === '' ? NaN : Number(raw)
    if (!Number.isFinite(value)) errors[id] = '숫자를 입력해 주세요.'
    else if ((min !== null && value < min) || (max !== null && value > max)) {
      errors[id] = `${min ?? ''}~${max ?? ''} 사이로 입력해 주세요.`
    } else values[id] = value
  }

  const effective = (id: string) => (Object.hasOwn(values, id) ? values[id] : byId.get(id)?.threshold)
  for (const [high, low] of orderedPairs) {
    const h = effective(high)
    const l = effective(low)
    // Equal or inverted, the appliance would flip on and off around one value
    if (h !== undefined && l !== undefined && l >= h && !errors[low] && !errors[high]) {
      errors[Object.hasOwn(input, low) ? low : high] = `${describeRule(byId.get(low)!).label} 값은 ${describeRule(byId.get(high)!).label}보다 낮아야 합니다.`
    }
  }
  return { values, errors }
}

import type { AppNotification, Outdoor, Prediction, Recommendation, RecommendationList } from '@/api/types'
import { broadcast } from './bus'
import { state } from './data'
import { handleCommand, onCommandResult } from './devices'

/**
 * The fake cloud server's v1.2 features: outdoor data, automation rules that run on their own
 * (ADR-012), AI prediction, threshold recommendations and the notification log.
 */

const HOUR = 3_600_000
const MINUTE = 60_000
const iso = (ms: number) => new Date(ms).toISOString()
let seq = 1

// ---- Automation rules (two server shapes, to exercise both adapters) ----

export type AutomationShape = 'rules' | 'flat'

interface Rule {
  id: string
  metric: string
  threshold: number
  enabled: boolean
  label: string
  description: string
  unit: string
  min: number
  max: number
}

export const cloud = {
  automationShape: 'rules' as AutomationShape,
  automationEnabled: true,
  rules: [
    { id: 'humidityHigh', metric: 'humidity', threshold: 70, enabled: true, label: '습도 상한', description: '실내 습도가 이 값을 넘으면 환기하거나 제습기를 켭니다', unit: '%', min: 30, max: 95 },
    { id: 'humidityLow', metric: 'humidity', threshold: 60, enabled: true, label: '제습기 끄기', description: '실내 습도가 이 값 아래로 내려가면 제습기를 끕니다', unit: '%', min: 20, max: 90 },
    { id: 'temperatureHigh', metric: 'temperature', threshold: 30, enabled: true, label: '온도 상한', description: '실내 온도가 이 값을 넘으면 환기합니다', unit: '°C', min: 15, max: 40 },
    { id: 'pm25Bad', metric: 'pm25', threshold: 35, enabled: true, label: '초미세먼지 나쁨', description: '외기 PM2.5가 이 값을 넘으면 창문을 닫고 공기청정기를 켭니다', unit: 'µg/m³', min: 1, max: 500 },
    { id: 'pm10Bad', metric: 'pm10', threshold: 80, enabled: true, label: '미세먼지 나쁨', description: '외기 PM10이 이 값을 넘으면 창문을 닫고 공기청정기를 켭니다', unit: 'µg/m³', min: 1, max: 1000 },
    { id: 'rainProbability', metric: 'precipitationProb', threshold: 60, enabled: true, label: '비 예보', description: '강수확률이 이 값 이상이면 창문을 열지 않습니다', unit: '%', min: 0, max: 100 },
  ] as Rule[],
  /** Unknown-to-the-frontend field, to check it survives a save */
  extra: { quietHours: '22-07' },
  outdoorScenario: 'normal' as OutdoorScenario,
  predictionScenario: 'normal' as PredictionScenario,
  recommendationMode: 'ready' as RecommendationMode,
  recommendations: [] as Recommendation[],
  notifications: [] as AppNotification[],
  /** The gateway tracks read state; off = a server that doesn't */
  trackRead: true,
}

const rule = (id: string) => cloud.rules.find((r) => r.id === id)!
const threshold = (id: string) => rule(id).threshold
const ruleOn = (id: string) => cloud.automationEnabled && rule(id).enabled

export function automationResponse(): Record<string, unknown> {
  if (cloud.automationShape === 'rules') {
    return { enabled: cloud.automationEnabled, ...cloud.extra, rules: cloud.rules.map((r) => ({ ...r })) }
  }
  const flat: Record<string, unknown> = { enabled: cloud.automationEnabled, ...cloud.extra }
  for (const r of cloud.rules) flat[r.id] = r.threshold
  return flat
}

/** PUT /api/automation: whole object, in whichever shape the server currently speaks */
export function putAutomation(body: unknown) {
  if (typeof body !== 'object' || body === null) return { status: 400, body: { message: '입력값을 확인하세요.' } }
  const b = body as Record<string, unknown>
  const next = cloud.rules.map((r) => ({ ...r }))
  if (cloud.automationShape === 'rules') {
    if (!Array.isArray(b.rules)) return { status: 400, body: { message: 'rules 배열이 필요합니다.' } }
    for (const row of b.rules as Record<string, unknown>[]) {
      const target = next.find((r) => r.id === row.id)
      if (!target) continue
      if (typeof row.threshold !== 'number' || row.threshold < target.min || row.threshold > target.max) {
        return { status: 400, body: { message: `${target.label}: ${target.min}~${target.max} 사이여야 합니다.` } }
      }
      target.threshold = row.threshold
      if (typeof row.enabled === 'boolean') target.enabled = row.enabled
    }
  } else {
    for (const target of next) {
      const value = b[target.id]
      if (value === undefined) continue
      if (typeof value !== 'number' || value < target.min || value > target.max) {
        return { status: 400, body: { message: `${target.label}: ${target.min}~${target.max} 사이여야 합니다.` } }
      }
      target.threshold = value
    }
  }
  const high = next.find((r) => r.id === 'humidityHigh')!.threshold
  const low = next.find((r) => r.id === 'humidityLow')!.threshold
  if (low >= high) return { status: 400, body: { message: '제습기 끄기 습도는 습도 상한보다 낮아야 합니다.' } }
  if (typeof b.enabled === 'boolean') cloud.automationEnabled = b.enabled
  if (typeof b.quietHours === 'string') cloud.extra.quietHours = b.quietHours
  cloud.rules = next
  return { status: 200, body: automationResponse() }
}

// ---- Outdoor ----

export type OutdoorScenario = 'normal' | 'dust' | 'rain' | 'partial' | 'stale' | 'unavailable'

export function outdoorResponse(): Outdoor | Record<string, unknown> {
  const now = Date.now()
  const s = cloud.outdoorScenario
  if (s === 'unavailable') {
    return { source: null, publishedAt: null, fetchedAt: null, stale: false, message: '공공데이터 API 키를 설정하면 외기 정보를 조회합니다.', temp: null, humidity: null, precipitationProb: null, pm25: null, pm10: null, hourly: [] }
  }
  const hourStart = Math.floor(now / HOUR) * HOUR
  const pm25 = s === 'dust' ? 52 : s === 'partial' ? null : 14
  const pm10 = s === 'dust' ? 95 : s === 'partial' ? null : 31
  const rain = s === 'rain' ? [70, 80, 80, 60, 40] : [10, 10, 20, 20, 20]
  return {
    source: 'kma+airkorea',
    publishedAt: iso(s === 'stale' ? now - 4 * HOUR : hourStart),
    fetchedAt: iso(s === 'stale' ? now - 4 * HOUR : now - 6 * MINUTE),
    stale: s === 'stale',
    message: s === 'partial' ? '에어코리아 조회에 실패해 미세먼지 값이 없습니다.' : null,
    temp: 21.4,
    humidity: s === 'rain' ? 84 : 48,
    precipitationProb: rain[2]!,
    pm25,
    pm10,
    hourly: [-2, -1, 0, 1, 2].map((n, i) => ({
      time: iso(hourStart + n * HOUR),
      temp: 21 + n * 0.4,
      humidity: s === 'rain' ? 80 + n : 48 + n * 2,
      precipitationProb: rain[i]!,
      pm25: pm25 === null ? null : pm25 + n * 3,
      pm10: pm10 === null ? null : pm10 + n * 4,
    })),
  }
}

// ---- Notifications ----

export function notify(title: string, body: string, data: Record<string, unknown> = {}) {
  const n: AppNotification = { id: `n-${seq++}`, title, body, createdAt: iso(Date.now()), read: cloud.trackRead ? false : null, data }
  cloud.notifications.unshift(n)
  cloud.notifications = cloud.notifications.slice(0, 100)
  broadcast({ type: 'notification.new', payload: { ...n } })
  return n
}

export function notificationsResponse() {
  return cloud.notifications.map((n) => (cloud.trackRead ? { ...n } : { id: n.id, title: n.title, message: n.body, createdAt: n.createdAt, data: n.data }))
}

export function markRead(id: string) {
  if (!cloud.trackRead) return { status: 404, body: { message: 'API를 찾을 수 없습니다.' } }
  const n = cloud.notifications.find((x) => x.id === id)
  if (!n) return { status: 404, body: { message: '알림을 찾을 수 없습니다.' } }
  n.read = true
  return { status: 200, body: { ...n } }
}

// Seed a few entries so the list isn't empty on first open
cloud.notifications = [
  { id: `n-${seq++}`, title: '공기청정기 켜기', body: '외기 초미세먼지 41µg/m³ (기준 35) · 자동 실행', createdAt: iso(Date.now() - 50 * MINUTE), read: true, data: { type: 'device.command', deviceId: 'purifier-1' } },
  { id: `n-${seq++}`, title: '기기 연결 복구', body: '3분 12초 동안 끊겨 있었고, 로컬 자동제어 1건을 실행했습니다', createdAt: iso(Date.now() - 26 * HOUR), read: true, data: { type: 'edge.recovered' } },
]

// ---- Automation engine (ADR-012: acts without approval, then notifies) ----

const lastRun = new Map<string, number>()
const COOLDOWN_MS = 90_000

/** Issues a command for a rule, once per cooldown, and logs it */
function autoCommand(deviceId: string, action: 'OPEN' | 'CLOSE' | 'ON' | 'OFF', reason: string, source = 'automation') {
  const device = state.devices.find((d) => d.id === deviceId)
  const target = action === 'CLOSE' ? 'CLOSED' : action
  if (!device || device.state === target) return
  const key = `${deviceId}:${action}`
  const now = Date.now()
  if (now - (lastRun.get(key) ?? 0) < COOLDOWN_MS) return
  const result = handleCommand(deviceId, action, null)
  if (result.status >= 400) return
  lastRun.set(key, now)
  const verb = { OPEN: '열기', CLOSE: '닫기', ON: '켜기', OFF: '끄기' }[action]
  pendingReasons.set((result.body as { commandId: string }).commandId, { title: `${device.name} ${verb}`, reason, deviceId, source })
}

const pendingReasons = new Map<string, { title: string; reason: string; deviceId: string; source: string }>()
onCommandResult((commandId, status, failReason) => {
  const p = pendingReasons.get(commandId)
  if (!p) return
  pendingReasons.delete(commandId)
  notify(
    status === 'EXECUTED' ? p.title : `${p.title} 실패`,
    status === 'EXECUTED' ? `${p.reason} · 자동 실행` : (failReason ?? '기기가 응답하지 않습니다.'),
    { type: p.source === 'prediction' ? 'prediction.control' : 'device.command', deviceId: p.deviceId, commandId },
  )
})

/** SAD v1.2 rule table, evaluated on every sensor tick and outdoor change */
export function evaluateRules() {
  if (!cloud.automationEnabled || !state.edge.online) return
  const outdoor = outdoorResponse() as Outdoor
  const r = state.latest
  const dustBad =
    (ruleOn('pm25Bad') && outdoor.pm25 !== null && outdoor.pm25 > threshold('pm25Bad')) ||
    (ruleOn('pm10Bad') && outdoor.pm10 !== null && outdoor.pm10 > threshold('pm10Bad'))
  if (dustBad) {
    const why = outdoor.pm25 !== null && outdoor.pm25 > threshold('pm25Bad') ? `외기 초미세먼지 ${outdoor.pm25}µg/m³ (기준 ${threshold('pm25Bad')})` : `외기 미세먼지 ${outdoor.pm10}µg/m³ (기준 ${threshold('pm10Bad')})`
    autoCommand('window-1', 'CLOSE', why)
    autoCommand('purifier-1', 'ON', why)
  }
  const humid = ruleOn('humidityHigh') && r.humidity !== null && r.humidity > threshold('humidityHigh')
  const hot = ruleOn('temperatureHigh') && r.temperature !== null && r.temperature > threshold('temperatureHigh')
  if (humid || hot) {
    const rainOk = outdoor.precipitationProb === null || !ruleOn('rainProbability') || outdoor.precipitationProb < threshold('rainProbability')
    const drier = outdoor.humidity !== null && r.humidity !== null && outdoor.humidity < r.humidity
    const why = humid ? `실내 습도 ${r.humidity}% (기준 ${threshold('humidityHigh')})` : `실내 온도 ${r.temperature}°C (기준 ${threshold('temperatureHigh')})`
    if (!dustBad && rainOk && drier && outdoor.pm25 !== null) autoCommand('window-1', 'OPEN', `${why} · 환기`)
    else if (humid) {
      autoCommand('window-1', 'CLOSE', why)
      autoCommand('dehumidifier-1', 'ON', why)
    }
  }
  if (ruleOn('humidityLow') && r.humidity !== null && r.humidity < threshold('humidityLow')) {
    autoCommand('dehumidifier-1', 'OFF', `실내 습도 ${r.humidity}% (기준 ${threshold('humidityLow')} 미만)`)
  }
}

// ---- Prediction ----

export type PredictionScenario = 'normal' | 'high' | 'worse' | 'none'

export function predictionResponse(): Prediction | Record<string, unknown> {
  const now = Date.now()
  const s = cloud.predictionScenario
  if (s === 'none') return { metrics: [], message: '예측 모델이 아직 없습니다. 측정 데이터가 1주일 쌓이면 학습합니다.' }
  const h = state.latest.humidity ?? 55
  const t = state.latest.temperature ?? 23
  const predictedH = s === 'high' ? Math.max(h + 6, 74) : h + 2
  const worse = s === 'worse'
  // Rows per metric, as the PREDICTION table would come out
  return {
    generatedAt: iso(now - 3 * MINUTE),
    targetAt: iso(now + 57 * MINUTE),
    controlEnabled: !worse,
    modelVersion: '2026-11-10',
    metrics: [
      { metric: 'humidity', predicted: Math.round(predictedH), baseline: Math.round(h), actual: null, mae: worse ? 4.8 : 2.1, baselineMae: 3.4 },
      { metric: 'temperature', predicted: Math.round((t + 0.6) * 10) / 10, baseline: t, actual: null, mae: worse ? 1.1 : 0.4, baselineMae: 0.7 },
    ],
  }
}

/** Every 10 minutes on the real server; the panel calls it on demand */
export function runPrediction() {
  const p = predictionResponse() as Prediction
  broadcast({ type: 'forecast.update', payload: p })
  const humidity = p.metrics?.find((m) => m.metric === 'humidity')
  if (p.controlEnabled && humidity?.predicted !== null && humidity !== undefined && humidity.predicted > threshold('humidityHigh') && state.edge.online) {
    autoCommand('dehumidifier-1', 'ON', `1시간 뒤 예측 습도 ${humidity.predicted}% (기준 ${threshold('humidityHigh')})`, 'prediction')
  }
}

// ---- Recommendations ----

export type RecommendationMode = 'ready' | 'collecting'

export function recommendationsResponse(): RecommendationList | Recommendation[] {
  const items = cloud.recommendations.map((r) => ({ ...r }))
  if (cloud.recommendationMode === 'collecting') return { items: items.filter((r) => r.status !== 'PROPOSED'), progress: { count: 4, required: 10 } }
  // A bare array, the other shape the parser accepts
  return items
}

export function proposeRecommendation() {
  for (const r of cloud.recommendations) if (r.status === 'PROPOSED') r.status = 'REJECTED'
  const current = threshold('humidityHigh')
  const rec: Recommendation = {
    id: `rec-${seq++}`,
    metric: 'humidityHigh',
    current,
    proposed: Math.max(60, Math.min(75, current - 4)),
    status: 'PROPOSED',
    evidenceCount: 14,
    reason: '수동으로 제습기를 켠 시점의 습도 중앙값',
    createdAt: iso(Date.now()),
    appliedAt: null,
  }
  cloud.recommendations.unshift(rec)
  broadcast({ type: 'recommendation.new', payload: { ...rec } })
}

const previousThreshold = new Map<string, number>()

export function actOnRecommendation(id: string, verb: string) {
  const rec = cloud.recommendations.find((r) => r.id === id)
  if (!rec) return { status: 404, body: { message: '추천을 찾을 수 없습니다.' } }
  const target = cloud.rules.find((r) => r.id === rec.metric)
  if (verb === 'apply') {
    if (rec.status !== 'PROPOSED') return { status: 409, body: { message: '이미 처리된 추천입니다.' } }
    if (target) {
      previousThreshold.set(rec.id, target.threshold)
      target.threshold = rec.proposed
    }
    rec.status = 'APPLIED'
    rec.appliedAt = iso(Date.now())
    notify('기준값 변경', `${target?.label ?? rec.metric} ${rec.current}% → ${rec.proposed}% (추천 적용)`, { type: 'recommendation.applied' })
  } else if (verb === 'reject') {
    if (rec.status !== 'PROPOSED') return { status: 409, body: { message: '이미 처리된 추천입니다.' } }
    rec.status = 'REJECTED'
  } else if (verb === 'revert') {
    if (rec.status !== 'APPLIED') return { status: 409, body: { message: '적용된 추천만 되돌릴 수 있습니다.' } }
    const prev = previousThreshold.get(rec.id)
    if (target && prev !== undefined) target.threshold = prev
    rec.status = 'REVERTED'
  } else return { status: 404, body: { message: 'API를 찾을 수 없습니다.' } }
  return { status: 200, body: { ...rec } }
}

// ---- Panel setters ----

export function setAutomationShape(shape: AutomationShape) {
  cloud.automationShape = shape
}
export function setOutdoorScenario(s: OutdoorScenario) {
  cloud.outdoorScenario = s
  evaluateRules()
}
export function setPredictionScenario(s: PredictionScenario) {
  cloud.predictionScenario = s
}
export function setRecommendationMode(m: RecommendationMode) {
  cloud.recommendationMode = m
}
export function setTrackRead(track: boolean) {
  cloud.trackRead = track
}

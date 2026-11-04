import type {
  AutomationSettings,
  Decision,
  DecisionReason,
  DeviceAction,
  WeatherForecastPoint,
  WeatherObservation,
} from '@/api/types'
import { broadcast } from './bus'
import { handleCommand, onCommandResult } from './devices'

export type WeatherScenario = 'normal' | 'rain' | 'no-air' | 'stale' | 'unavailable'

const HOUR = 3_600_000
const MINUTE = 60_000

export const forecastState = {
  weatherScenario: 'normal' as WeatherScenario,
  /** Off: only `decision.proposed` and `command.ack` are pushed, like a server without `decision.updated` */
  pushDecisionUpdates: true,
  settings: {
    enabled: true,
    mode: 'APPROVAL',
    humidityOn: 65,
    humidityOff: 55,
    co2Open: 1000,
    pm25On: 35,
    rainProbability: 60,
  } as AutomationSettings,
  decisions: [] as Decision[],
}

let seq = 1
const iso = (ms: number) => new Date(ms).toISOString()

forecastState.decisions = [
  {
    id: `decision-${seq++}`,
    deviceId: 'dehumidifier-1',
    action: 'ON',
    status: 'PROPOSED',
    reasons: [{ factor: '실내 습도', value: '72%', threshold: '65% 이상' }],
    createdAt: iso(Date.now() - 2 * MINUTE),
  },
  {
    id: `decision-${seq++}`,
    deviceId: 'purifier-1',
    action: 'ON',
    status: 'EXECUTED',
    reasons: [{ factor: '실내 초미세먼지', value: '41µg/m³', threshold: '35 이상' }],
    createdAt: iso(Date.now() - 50 * MINUTE),
  },
  {
    id: `decision-${seq++}`,
    deviceId: 'window-1',
    action: 'OPEN',
    status: 'EXPIRED',
    reasons: [{ factor: '실내 CO₂', value: '1,240ppm', threshold: '1,000ppm 이상' }],
    createdAt: iso(Date.now() - 3 * HOUR),
  },
]

export function setWeatherScenario(scenario: WeatherScenario) {
  forecastState.weatherScenario = scenario
}

export function setPushDecisionUpdates(push: boolean) {
  forecastState.pushDecisionUpdates = push
}

function setStatus(decision: Decision, status: string, reason?: string) {
  decision.status = status
  if (reason) decision.reason = reason
  if (forecastState.pushDecisionUpdates) broadcast({ type: 'decision.updated', payload: { ...decision } })
}

onCommandResult((commandId, status, reason) => {
  const decision = forecastState.decisions.find((d) => d.commandId === commandId)
  if (decision) setStatus(decision, status, reason)
})

/** Issues the decision's command. Returns the failure, if the device couldn't take it. */
function execute(decision: Decision) {
  const result = handleCommand(decision.deviceId, decision.action, null)
  if (result.status >= 400) return result
  const body = result.body as { commandId: string; status: string }
  decision.commandId = body.commandId
  // A synchronous answer has no ack coming
  setStatus(decision, body.status === 'EXECUTED' ? 'EXECUTED' : 'APPROVED')
  return null
}

export function proposeDecision(deviceId: string, action: DeviceAction, reasons: DecisionReason[]) {
  if (!forecastState.settings.enabled) return
  const decision: Decision = {
    id: `decision-${seq++}`,
    deviceId,
    action,
    status: 'PROPOSED',
    reasons,
    createdAt: iso(Date.now()),
  }
  forecastState.decisions.unshift(decision)
  broadcast({ type: 'decision.proposed', payload: { ...decision } })
  if (forecastState.settings.mode === 'AUTO') execute(decision)
}

export function expireOpenDecisions() {
  for (const d of forecastState.decisions) if (d.status === 'PROPOSED') setStatus(d, 'EXPIRED')
}

/** Fake server's POST /api/decisions/:id/approve and /reject */
export function decide(id: string, approve: boolean) {
  const decision = forecastState.decisions.find((d) => d.id === id)
  if (!decision) return { status: 404, body: { message: '추천을 찾을 수 없습니다.' } }
  if (decision.status !== 'PROPOSED') return { status: 409, body: { message: '이미 처리되었거나 만료된 추천입니다.' } }
  if (approve) {
    const failure = execute(decision)
    if (failure) return failure
    return { status: 202, body: { ...decision } }
  }
  setStatus(decision, 'REJECTED')
  return { status: 200, body: { ...decision } }
}

/** Fake server's PUT /api/settings/automation: replaces the whole object, so it requires all of it */
export function putSettings(body: unknown) {
  const b = body as Partial<AutomationSettings> | null
  const numbers = ['humidityOn', 'humidityOff', 'co2Open', 'pm25On', 'rainProbability'] as const
  if (
    typeof b?.enabled !== 'boolean' ||
    (b.mode !== 'AUTO' && b.mode !== 'APPROVAL') ||
    numbers.some((k) => typeof b[k] !== 'number')
  ) {
    return { status: 400, body: { message: '입력값을 확인하세요.' } }
  }
  if ((b.humidityOff as number) >= (b.humidityOn as number)) {
    return { status: 400, body: { message: '제습기 끄기 습도는 켜기 습도보다 낮아야 합니다.' } }
  }
  forecastState.settings = b as AutomationSettings
  if (!forecastState.settings.enabled) expireOpenDecisions()
  return { status: 200, body: forecastState.settings }
}

export function forecastResponse() {
  const now = Date.now()
  const hourStart = Math.floor(now / HOUR) * HOUR
  const scenario = forecastState.weatherScenario
  const decisions = forecastState.decisions.map((d) => ({ ...d }))

  if (scenario === 'unavailable') {
    return {
      source: 'unavailable',
      updatedAt: null,
      stale: false,
      weather: [],
      observations: [],
      message: '기상청 API 키를 설정하면 예보를 조회합니다.',
      decisions,
    }
  }

  const observations: WeatherObservation[] = [2, 1].map((n) => ({
    time: iso(hourStart - n * HOUR),
    temp: 21 + (2 - n) * 0.6,
    humidity: 58,
    precipitation: 0,
  }))
  const rain = [20, 30, 80]
  const weather: WeatherForecastPoint[] = [0, 1, 2].map((n) => ({
    time: iso(hourStart + n * HOUR),
    temp: 22 + n,
    humidity: scenario === 'rain' ? 78 : 55,
    precipitationProb: scenario === 'rain' ? (rain[n] ?? 0) : 20,
    pm25: scenario === 'no-air' ? null : 14 + n * 12,
  }))

  return {
    source: 'demo',
    updatedAt: iso(scenario === 'stale' ? now - 2 * HOUR : now - 4 * MINUTE),
    stale: scenario === 'stale',
    weather: scenario === 'stale' ? [] : weather,
    observations,
    ...(scenario === 'no-air'
      ? { message: '실외 미세먼지 정보가 없어 자동 환기는 보류합니다.' }
      : {}),
    decisions,
  }
}

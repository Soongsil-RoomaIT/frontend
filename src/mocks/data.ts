import type { Device, EdgeStatus, HistoryRange, LocalAction, SensorHistory, SensorReading } from '@/api/types'

/**
 * Mutable in-memory state of the fake backend. REST handlers and the WebSocket mock
 * both read from here, so pushed and fetched data always agree.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR

// Smooth daily cycle + slower drift, so history looks plausible and consecutive points connect
function signal(t: number, base: number, dailyAmp: number, driftAmp: number, phase = 0) {
  const daily = Math.sin(((t % DAY) / DAY) * 2 * Math.PI + phase)
  const drift = Math.sin(t / (5.3 * HOUR) + phase * 2) * 0.6 + Math.sin(t / (1.7 * HOUR) + phase) * 0.4
  return base + daily * dailyAmp + drift * driftAmp
}

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Which sensors the fake edge has. SAD v1.2: only temperature/humidity (DHT11); CO₂ and dust
 * are null (ADR-008). 'full' is the older lineup, 'failing' a DHT read error.
 */
export type SensorScenario = 'v1.2' | 'full' | 'failing'

function readingAt(t: number, noise = 0, scenario: SensorScenario = state.sensorScenario): SensorReading {
  const n = () => (Math.random() * 2 - 1) * noise
  const full = scenario === 'full'
  const failing = scenario === 'failing'
  return {
    measuredAt: new Date(t).toISOString(),
    temperature: failing ? null : round1(signal(t, 23.5, 2, 1, -1.2) + n() * 0.3 + state.humidityOffset * 0.05),
    humidity: failing ? null : Math.min(99, round1(signal(t, 56, 8, 6, 0.8) + n() * 1.5 + state.humidityOffset)),
    co2: full ? Math.round(signal(t, 950, 280, 220, 2.1) + n() * 40) : null,
    pm25: full ? Math.max(1, Math.round(signal(t, 20, 9, 7, 0.3) + n() * 2)) : null,
    pm10: full ? Math.max(2, Math.round(signal(t, 36, 14, 10, 0.5) + n() * 3)) : null,
  }
}

export const nextReading = () => readingAt(Date.now(), 1)

const bucketSeconds: Record<HistoryRange, number> = { '1h': 60, '24h': 300, '7d': 3600 }
const rangeMs: Record<HistoryRange, number> = { '1h': HOUR, '24h': DAY, '7d': 7 * DAY }

export function historyFor(range: HistoryRange): SensorHistory {
  const step = bucketSeconds[range] * 1000
  const end = Math.floor(Date.now() / step) * step
  const points: SensorReading[] = []
  for (let t = end - rangeMs[range] + step; t <= end; t += step) {
    points.push(readingAt(t, 0.5, state.sensorScenario === 'failing' ? 'v1.2' : state.sensorScenario))
  }
  return { range, bucketSeconds: bucketSeconds[range], points }
}

const at = new Date().toISOString()

// SAD 10.3 ④: window and LED appliances report what was commanded; the door has a touch sensor
const initialDevices: Device[] = [
  { id: 'window-1', type: 'WINDOW', name: '창문', state: 'CLOSED', updatedAt: at, stateSource: 'COMMANDED' },
  // Servo pressing a button: no feedback, so the state is assumed (ADR-006)
  { id: 'dehumidifier-1', type: 'DEHUMIDIFIER', name: '제습기', state: 'OFF', updatedAt: at, stateSource: 'ASSUMED' },
  { id: 'purifier-1', type: 'AIR_PURIFIER', name: '공기청정기', state: 'ON', updatedAt: at, stateSource: 'COMMANDED' },
  { id: 'door-1', type: 'FRONT_DOOR', name: '현관문', state: 'CLOSED', updatedAt: at, stateSource: 'SENSOR', actions: ['CLOSE'] },
]

const initialEdge: EdgeStatus = { online: true, offlineMode: false, lastSeenAt: at }

export const state = {
  sensorScenario: 'v1.2' as SensorScenario,
  /** Added to the generated humidity, so the panel can push it over a threshold */
  humidityOffset: 0,
  latest: null as unknown as SensorReading,
  devices: initialDevices,
  edge: initialEdge,
  /** When the edge went offline (for the recovery report) */
  offlineSince: null as string | null,
  /** Simulates the cloud server being unreachable (REST 503 + WebSocket refused) */
  serverDown: false,
  /** How the fake server answers device commands (see MockScenarioPanel) */
  commandMode: 'normal' as CommandMode,
  /** FR-03: how long the (fake) edge lets the front door stay open before closing it */
  doorAutoCloseMs: 10 * 60_000,
}
state.latest = readingAt(Date.now(), 1)

export type CommandMode = 'normal' | 'fail' | 'timeout' | 'sync'

/** What the edge would plausibly do on its own while disconnected: humidity rule only (SAD v1.2) */
export function simulatedLocalActions(offlineSince: number, now: number): LocalAction[] {
  const actions: LocalAction[] = []
  const mid = new Date((offlineSince + now) / 2).toISOString()
  const humidity = state.latest.humidity
  if (humidity !== null && humidity > 55) {
    actions.push({ executedAt: mid, deviceId: 'dehumidifier-1', state: 'ON', reason: `습도 ${Math.round(humidity)}%` })
  }
  return actions
}

export function setCommandMode(mode: CommandMode) {
  state.commandMode = mode
}

export function setDoorAutoCloseMs(ms: number) {
  state.doorAutoCloseMs = ms
}

export function setSensorScenario(scenario: SensorScenario) {
  state.sensorScenario = scenario
}

export function setHumidityOffset(offset: number) {
  state.humidityOffset = offset
}

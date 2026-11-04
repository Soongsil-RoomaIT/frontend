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

function readingAt(t: number, noise = 0): SensorReading {
  const n = () => (Math.random() * 2 - 1) * noise
  return {
    measuredAt: new Date(t).toISOString(),
    temperature: round1(signal(t, 23.5, 2, 1, -1.2) + n() * 0.3),
    humidity: round1(signal(t, 56, 8, 6, 0.8) + n() * 1.5),
    co2: Math.round(signal(t, 950, 280, 220, 2.1) + n() * 40),
    pm25: Math.max(1, Math.round(signal(t, 20, 9, 7, 0.3) + n() * 2)),
    pm10: Math.max(2, Math.round(signal(t, 36, 14, 10, 0.5) + n() * 3)),
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
    points.push(readingAt(t, 0.5))
  }
  return { range, bucketSeconds: bucketSeconds[range], points }
}

const at = new Date().toISOString()

const initialDevices: Device[] = [
  { id: 'window-1', type: 'WINDOW', name: '창문', state: 'CLOSED', updatedAt: at },
  // Simulates an IR-controlled appliance: no state feedback, so the state is assumed
  { id: 'dehumidifier-1', type: 'DEHUMIDIFIER', name: '제습기', state: 'OFF', updatedAt: at, stateSource: 'ASSUMED' },
  { id: 'purifier-1', type: 'AIR_PURIFIER', name: '공기청정기', state: 'ON', updatedAt: at },
  { id: 'door-1', type: 'FRONT_DOOR', name: '현관문', state: 'CLOSED', updatedAt: at },
]

const initialEdge: EdgeStatus = { online: true, offlineMode: false, lastSeenAt: at }

export const state = {
  latest: readingAt(Date.now(), 1),
  devices: initialDevices,
  edge: initialEdge,
  /** When the edge went offline (for the recovery report) */
  offlineSince: null as string | null,
  /** Simulates the cloud server being unreachable (REST 503 + WebSocket refused) */
  serverDown: false,
  /** How the fake server answers device commands (see MockScenarioPanel) */
  commandMode: 'normal' as CommandMode,
  /** FR-03: how long the front door may stay open before the system closes it */
  doorAutoCloseMs: 10 * 60_000,
}

export type CommandMode = 'normal' | 'fail' | 'timeout' | 'sync'

/** What the edge would plausibly do on its own while disconnected, given current readings */
export function simulatedLocalActions(offlineSince: number, now: number): LocalAction[] {
  const actions: LocalAction[] = []
  const mid = new Date((offlineSince + now) / 2).toISOString()
  if (state.latest.humidity > 55) {
    actions.push({ executedAt: mid, deviceId: 'dehumidifier-1', state: 'ON', reason: `습도 ${Math.round(state.latest.humidity)}%` })
  }
  if (state.latest.co2 > 1000) {
    actions.push({ executedAt: mid, deviceId: 'window-1', state: 'OPEN', reason: `CO₂ ${state.latest.co2}ppm` })
  }
  return actions
}

export function setCommandMode(mode: CommandMode) {
  state.commandMode = mode
}

export function setDoorAutoCloseMs(ms: number) {
  state.doorAutoCloseMs = ms
}

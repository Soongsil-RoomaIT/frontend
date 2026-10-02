import { ws } from 'msw'
import type { Device } from '@/api/types'
import { HEARTBEAT_INTERVAL_MS, type ServerMessage } from '@/realtime/protocol'
import { nextReading, simulatedLocalActions, state } from './data'

const SENSOR_INTERVAL_MS = 5_000

const encode = (message: ServerMessage) => JSON.stringify(message)

// Falls back to a placeholder so an empty VITE_WS_URL doesn't break the mock setup
export const realtimeLink = ws.link(import.meta.env.VITE_WS_URL || 'ws://localhost/ws')

/** The request handler to register with MSW (the link itself is not a handler) */
export const realtimeHandler = realtimeLink.addEventListener('connection', ({ client }) => {
  if (state.serverDown) {
    // 1013 Try Again Later: the client should back off and retry
    client.close(1013, 'Simulated outage')
    return
  }

  client.send(encode({ type: 'edge.status', payload: state.edge }))

  const timer = setInterval(() => {
    if (!state.edge.online) return // a disconnected edge sends nothing
    state.latest = nextReading()
    state.edge = { ...state.edge, lastSeenAt: state.latest.measuredAt }
    client.send(encode({ type: 'sensor.update', payload: state.latest }))
  }, SENSOR_INTERVAL_MS)

  // Keeps proving the link is alive even when the edge is offline and no data flows
  const heartbeat = setInterval(() => client.send(encode({ type: 'heartbeat' })), HEARTBEAT_INTERVAL_MS)

  client.addEventListener('message', (event) => {
    if (typeof event.data === 'string' && event.data.includes('"ping"')) {
      client.send(encode({ type: 'heartbeat' }))
    }
  })

  client.addEventListener('close', () => {
    clearInterval(timer)
    clearInterval(heartbeat)
  })
})

const broadcast = (message: ServerMessage) => realtimeLink.broadcast(encode(message))

// ---- Scenario controls (used by the dev-only MockScenarioPanel) ----

export function setEdgeOnline(online: boolean) {
  if (state.edge.online === online) return
  const now = Date.now()

  if (!online) {
    state.offlineSince = new Date(now).toISOString()
    state.edge = { ...state.edge, online: false }
    broadcast({ type: 'edge.status', payload: state.edge })
    return
  }

  const offlineSince = state.offlineSince ?? new Date(now).toISOString()
  const localActions = simulatedLocalActions(Date.parse(offlineSince), now)
  // Apply what the edge did locally so device state reflects it after recovery
  for (const a of localActions) {
    state.devices = state.devices.map((d) => (d.id === a.deviceId ? { ...d, state: a.state, updatedAt: a.executedAt } : d))
  }
  state.offlineSince = null
  state.latest = nextReading()
  state.edge = { online: true, offlineMode: false, lastSeenAt: state.latest.measuredAt }

  broadcast({ type: 'edge.status', payload: state.edge })
  broadcast({
    type: 'edge.recovered',
    payload: { offlineSince, recoveredAt: new Date(now).toISOString(), localActions },
  })
  broadcast({ type: 'sensor.update', payload: state.latest })
}

/** Drops every WebSocket and fails REST for `durationMs`, like a server restart. */
export function simulateServerOutage(durationMs: number) {
  state.serverDown = true
  for (const client of realtimeLink.clients) client.close(1012, 'Simulated restart')
  setTimeout(() => {
    state.serverDown = false
  }, durationMs)
}

export function toggleDevice(type: Device['type']) {
  const now = new Date().toISOString()
  let changed: Device | undefined
  state.devices = state.devices.map((d) => {
    if (d.type !== type) return d
    const next = d.state === 'OPEN' ? 'CLOSED' : d.state === 'CLOSED' ? 'OPEN' : d.state === 'ON' ? 'OFF' : 'ON'
    changed = { ...d, state: next, updatedAt: now }
    return changed
  })
  if (changed) broadcast({ type: 'device.state', payload: changed })
}

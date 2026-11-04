import { isDevice } from '@/realtime/protocol'
import { apiFetch } from './client'
import { isAutomationSettings, parseAutomationSettings, parseForecast } from './forecastParser'
import type {
  AutomationSettings,
  CommandResponse,
  Device,
  DeviceAction,
  EdgeStatus,
  HistoryRange,
  SensorHistory,
  SensorReading,
} from './types'

/**
 * Drops malformed entries instead of failing the whole list, so one bad record from a
 * still-changing backend doesn't blank the device screens.
 */
function parseDevices(data: unknown): Device[] {
  if (!Array.isArray(data)) throw new Error('Expected an array of devices')
  const valid = data.filter(isDevice)
  if (import.meta.env.DEV && valid.length !== data.length) {
    console.warn('[api] Ignored malformed devices', data.filter((d) => !isDevice(d)))
  }
  return valid
}

export const api = {
  getLatestSensors: () => apiFetch<SensorReading>('/api/sensors/latest'),
  getSensorHistory: (range: HistoryRange) =>
    apiFetch<SensorHistory>(`/api/sensors/history?range=${encodeURIComponent(range)}`),
  getDevices: async () => parseDevices(await apiFetch<unknown>('/api/devices')),
  getEdgeStatus: () => apiFetch<EdgeStatus>('/api/edge/status'),
  /**
   * The idempotency key lets the server drop a duplicate if the same press is ever
   * sent twice (e.g. a retried request). Physical actions must not run twice.
   */
  sendDeviceCommand: (deviceId: string, action: DeviceAction, idempotencyKey: string) =>
    apiFetch<CommandResponse>(`/api/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ action }),
    }),
  getForecast: async () => parseForecast(await apiFetch<unknown>('/api/forecast')),
  /** Resolves to whatever the server answers; callers use it only if it's a valid Decision. */
  approveDecision: (id: string) =>
    apiFetch<unknown>(`/api/decisions/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  rejectDecision: (id: string) =>
    apiFetch<unknown>(`/api/decisions/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
  getAutomationSettings: async () => parseAutomationSettings(await apiFetch<unknown>('/api/settings/automation')),
  updateAutomationSettings: async (settings: AutomationSettings) => {
    const saved = await apiFetch<unknown>('/api/settings/automation', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
    // A server may answer 204; what we sent is then what's stored
    return isAutomationSettings(saved) ? saved : settings
  },
}

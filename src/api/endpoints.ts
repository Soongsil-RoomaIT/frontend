import { apiFetch } from './client'
import {
  parseDevices,
  parseEdgeStatus,
  parseNotifications,
  parseOutdoor,
  parsePrediction,
  parseRecommendation,
  parseRecommendationList,
  parseSensorHistory,
  parseSensorReading,
} from './parsers'
import type { DeviceAction, HistoryRange } from './types'

/**
 * Paths live here, response shapes in parsers.ts. A backend change touches one of the two.
 * Response normalization never throws on a missing optional field, only on a response that
 * isn't the resource at all (e.g. an HTML error page that slipped through with 200).
 */
export const api = {
  getLatestSensors: async () => {
    const reading = parseSensorReading(await apiFetch<unknown>('/api/sensors/latest'))
    if (!reading) throw new Error('Expected a sensor reading')
    return reading
  },
  getSensorHistory: async (range: HistoryRange) =>
    parseSensorHistory(await apiFetch<unknown>(`/api/sensors/history?range=${encodeURIComponent(range)}`), range),
  getDevices: async () => parseDevices(await apiFetch<unknown>('/api/devices')),
  getEdgeStatus: async () => {
    const status = parseEdgeStatus(await apiFetch<unknown>('/api/edge/status'))
    if (!status) throw new Error('Expected an edge status')
    return status
  },
  /**
   * The idempotency key lets the server drop a duplicate if the same press is ever
   * sent twice (e.g. a retried request). Physical actions must not run twice.
   */
  sendDeviceCommand: (deviceId: string, action: DeviceAction, idempotencyKey: string) =>
    apiFetch<import('./types').CommandResponse>(`/api/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ action }),
    }),

  getOutdoor: async () => parseOutdoor(await apiFetch<unknown>('/api/outdoor')),
  getPrediction: async () => parsePrediction(await apiFetch<unknown>('/api/forecast')),

  getRecommendations: async () => parseRecommendationList(await apiFetch<unknown>('/api/recommendations')),
  /** apply / reject / revert. Resolves to the updated recommendation when the server returns one. */
  actOnRecommendation: async (id: string, verb: 'apply' | 'reject' | 'revert') =>
    parseRecommendation(
      await apiFetch<unknown>(`/api/recommendations/${encodeURIComponent(id)}/${verb}`, { method: 'POST' }),
    ),

  /** Raw: the automation model (automationModel.ts) interprets and writes back the server's shape */
  getAutomationRaw: () => apiFetch<unknown>('/api/automation'),
  putAutomationRaw: (body: unknown) =>
    apiFetch<unknown>('/api/automation', { method: 'PUT', body: JSON.stringify(body) }),

  getNotifications: async () => parseNotifications(await apiFetch<unknown>('/api/notifications')),
  markNotificationRead: (id: string) =>
    apiFetch<unknown>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
}

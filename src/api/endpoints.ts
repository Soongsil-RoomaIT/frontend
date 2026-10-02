import { apiFetch } from './client'
import type { Device, EdgeStatus, HistoryRange, SensorHistory, SensorReading } from './types'

export const api = {
  getLatestSensors: () => apiFetch<SensorReading>('/api/sensors/latest'),
  getSensorHistory: (range: HistoryRange) =>
    apiFetch<SensorHistory>(`/api/sensors/history?range=${encodeURIComponent(range)}`),
  getDevices: () => apiFetch<Device[]>('/api/devices'),
  getEdgeStatus: () => apiFetch<EdgeStatus>('/api/edge/status'),
}

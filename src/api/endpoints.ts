import { apiFetch } from './client'
import type { Device, EdgeStatus, SensorReading } from './types'

export const api = {
  getLatestSensors: () => apiFetch<SensorReading>('/api/sensors/latest'),
  getDevices: () => apiFetch<Device[]>('/api/devices'),
  getEdgeStatus: () => apiFetch<EdgeStatus>('/api/edge/status'),
}

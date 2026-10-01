import type { Device, EdgeStatus, SensorReading } from '@/api/types'

const jitter = (base: number, range: number) =>
  Math.round((base + (Math.random() * 2 - 1) * range) * 10) / 10

export function mockSensorReading(): SensorReading {
  return {
    measuredAt: new Date().toISOString(),
    temperature: jitter(24, 1.5),
    humidity: jitter(58, 6),
    co2: Math.round(jitter(900, 250)),
    pm25: Math.round(jitter(18, 8)),
    pm10: Math.round(jitter(32, 12)),
  }
}

export const mockDevices: Device[] = [
  { id: 'window-1', type: 'WINDOW', name: '창문', state: 'CLOSED', updatedAt: new Date().toISOString() },
  { id: 'dehumidifier-1', type: 'DEHUMIDIFIER', name: '제습기', state: 'OFF', updatedAt: new Date().toISOString() },
  { id: 'purifier-1', type: 'AIR_PURIFIER', name: '공기청정기', state: 'ON', updatedAt: new Date().toISOString() },
  { id: 'door-1', type: 'FRONT_DOOR', name: '현관문', state: 'CLOSED', updatedAt: new Date().toISOString() },
]

export function mockEdgeStatus(): EdgeStatus {
  return { online: true, offlineMode: false, lastSeenAt: new Date().toISOString() }
}

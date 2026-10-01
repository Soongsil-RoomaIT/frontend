// Draft API contract shared with the cloud server. Keep in sync with the backend team.

export interface SensorReading {
  /** ISO 8601 measurement time (edge clock) */
  measuredAt: string
  temperature: number // °C
  humidity: number // %RH
  co2: number // ppm
  pm25: number // µg/m³
  pm10: number // µg/m³
}

export type DeviceType = 'WINDOW' | 'DEHUMIDIFIER' | 'AIR_PURIFIER' | 'FRONT_DOOR'

export interface Device {
  id: string
  type: DeviceType
  name: string
  /** WINDOW / FRONT_DOOR: OPEN | CLOSED, appliances: ON | OFF */
  state: 'OPEN' | 'CLOSED' | 'ON' | 'OFF'
  updatedAt: string
}

export interface EdgeStatus {
  online: boolean
  /** true while the Raspberry Pi runs local auto-control (NFR-03) */
  offlineMode: boolean
  lastSeenAt: string
}

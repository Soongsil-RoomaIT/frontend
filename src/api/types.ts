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

export type SensorMetric = Exclude<keyof SensorReading, 'measuredAt'>

export type HistoryRange = '1h' | '24h' | '7d'

export interface SensorHistory {
  range: HistoryRange
  /** Width of each aggregation bucket. Each point is the bucket average; measuredAt is the bucket start. */
  bucketSeconds: number
  points: SensorReading[]
}

export type DeviceType = 'WINDOW' | 'DEHUMIDIFIER' | 'AIR_PURIFIER' | 'FRONT_DOOR'
export type DeviceState = 'OPEN' | 'CLOSED' | 'ON' | 'OFF'

export interface Device {
  id: string
  type: DeviceType
  name: string
  /** WINDOW / FRONT_DOOR: OPEN | CLOSED, appliances: ON | OFF */
  state: DeviceState
  updatedAt: string
}

export interface EdgeStatus {
  /** Whether the cloud currently hears from the Raspberry Pi */
  online: boolean
  /** Reported by the edge: true while it runs local auto-control instead of cloud decisions (NFR-03) */
  offlineMode: boolean
  /** Last time the cloud received anything from the edge */
  lastSeenAt: string
}

/** An action the edge executed on its own while disconnected from the cloud */
export interface LocalAction {
  executedAt: string
  deviceId: string
  state: DeviceState
  reason: string
}

/** Sent once when the edge reconnects after a disconnection (NFR-03) */
export interface EdgeRecoveryReport {
  offlineSince: string
  recoveredAt: string
  localActions: LocalAction[]
}

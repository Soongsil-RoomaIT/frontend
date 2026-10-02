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

export type KnownDeviceType = 'WINDOW' | 'DEHUMIDIFIER' | 'AIR_PURIFIER' | 'FRONT_DOOR'
/**
 * Open-ended on purpose: the hardware lineup isn't final. An unknown type renders as a
 * generic device instead of breaking the UI. (`string & {}` keeps autocomplete for known types.)
 */
export type DeviceType = KnownDeviceType | (string & {})
export type DeviceState = 'OPEN' | 'CLOSED' | 'ON' | 'OFF'
export type DeviceAction = 'OPEN' | 'CLOSE' | 'ON' | 'OFF'

export interface Device {
  id: string
  type: DeviceType
  name: string
  /** WINDOW / FRONT_DOOR: OPEN | CLOSED, appliances: ON | OFF */
  state: DeviceState
  /** When `state` last changed */
  updatedAt: string
  /**
   * Actions this device accepts. Omitted → frontend defaults for its type.
   * `[]` → read-only (e.g. sensor without an actuator).
   */
  actions?: DeviceAction[]
  /**
   * How `state` is known. 'ASSUMED' = no feedback from the device (e.g. IR remote),
   * so it's the last commanded state. Omitted → 'SENSOR'.
   */
  stateSource?: 'SENSOR' | 'ASSUMED'
  /**
   * FRONT_DOOR (FR-03): when the system will auto-close it.
   * Omitted → derived as `updatedAt + 10 min` while OPEN. `null` → auto-close disabled.
   */
  autoCloseAt?: string | null
}

export type CommandStatus = 'PENDING' | 'EXECUTED' | 'FAILED'

/** Response to POST /api/devices/{id}/commands */
export interface CommandResponse {
  commandId: string
  /** PENDING → result arrives later as `command.ack`. EXECUTED / FAILED → already done (sync server). */
  status: CommandStatus
  reason?: string
  /** Updated device, when the server already knows it */
  device?: Device
}

/** WebSocket `command.ack` payload: the final result of a PENDING command */
export interface CommandAck {
  commandId: string
  deviceId: string
  status: Exclude<CommandStatus, 'PENDING'>
  /** Human-readable, shown to the user on failure */
  reason?: string
  device?: Device
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

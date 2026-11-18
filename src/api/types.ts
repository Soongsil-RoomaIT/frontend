// API contract with the cloud server (via the gateway). Every type here is what the app sees
// AFTER src/api/parsers.ts normalized the response, so timestamps are ISO and "no value" is null.

export type SensorMetric = 'temperature' | 'humidity' | 'co2' | 'pm25' | 'pm10'

/**
 * A measurement. Any metric can be null: the edge only has a temperature/humidity sensor
 * (SAD v1.2, ADR-008), and a sensor can fail. Missing is never shown as 0.
 */
export interface SensorReading {
  measuredAt: string
  temperature: number | null // °C
  humidity: number | null // %RH
  co2: number | null // ppm
  pm25: number | null // µg/m³
  pm10: number | null // µg/m³
}

export type HistoryRange = '1h' | '24h' | '7d'

export interface SensorHistory {
  range: HistoryRange
  /** Width of each aggregation bucket, when the server says. Each point is the bucket average. */
  bucketSeconds: number | null
  points: SensorReading[]
}

export type KnownDeviceType = 'WINDOW' | 'DEHUMIDIFIER' | 'AIR_PURIFIER' | 'FRONT_DOOR'
/**
 * Open-ended on purpose: the hardware lineup isn't final. An unknown type renders as a
 * generic device instead of breaking the UI. (`string & {}` keeps autocomplete for known values.)
 */
export type DeviceType = KnownDeviceType | (string & {})
export type KnownDeviceState = 'OPEN' | 'CLOSED' | 'ON' | 'OFF'
/** Also open-ended: a driver can report OPENING, FAULT, UNKNOWN... which is shown as is */
export type DeviceState = KnownDeviceState | (string & {})
export type DeviceAction = 'OPEN' | 'CLOSE' | 'ON' | 'OFF'
/**
 * How `state` is known (ADR-006). SENSOR: read back from the device. COMMANDED: whatever was last
 * commanded, by an actuator that can't disagree (servo angle, LED). ASSUMED: last command to a
 * device that gives no feedback (servo pressing a button), so it may be wrong.
 */
export type KnownStateSource = 'SENSOR' | 'COMMANDED' | 'ASSUMED'
export type StateSource = KnownStateSource | (string & {})

export interface Device {
  id: string
  type: DeviceType
  name: string
  state: DeviceState
  /** When `state` last changed */
  updatedAt: string
  /** Actions this device accepts. Omitted → frontend defaults for its type. `[]` → read-only. */
  actions?: DeviceAction[]
  stateSource?: StateSource
  /**
   * FRONT_DOOR (FR-03): when the edge will auto-close it (ADR-010). The countdown shows only
   * when this is set; the frontend never guesses a deadline.
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

// ---- Outdoor conditions (GET /api/outdoor) ----

export interface OutdoorHour {
  time: string
  temp: number | null
  humidity: number | null
  precipitationProb: number | null
  pm25: number | null
  pm10: number | null
}

/** Outdoor weather and air quality from public APIs, cached by the server (ADR-015) */
export interface Outdoor {
  /** When the data was issued (forecast base time / measurement time) */
  publishedAt: string | null
  /** When the server last fetched it */
  fetchedAt: string | null
  /** Where it came from, e.g. "kma", "airkorea", "demo" */
  source: string | null
  stale: boolean
  /** Server's note for the user */
  message: string | null
  temp: number | null
  humidity: number | null
  precipitationProb: number | null
  pm25: number | null
  pm10: number | null
  /** Hourly values around now, when the server provides them (±2h, FR-02) */
  hourly: OutdoorHour[]
}

// ---- AI prediction (GET /api/forecast, WebSocket forecast.update) ----

export type KnownPredictionMetric = 'humidity' | 'temperature'

export interface PredictionMetric {
  metric: KnownPredictionMetric | (string & {})
  /** Model's value for `targetAt` */
  predicted: number | null
  /** Baseline: "same as now" (SAD 1.3) */
  baseline: number | null
  /** Filled in once the target time has passed */
  actual: number | null
  /** Recent (24h) mean absolute error of the model and of the baseline */
  mae: number | null
  baselineMae: number | null
}

export interface Prediction {
  generatedAt: string | null
  /** The time being predicted (about an hour ahead) */
  targetAt: string | null
  /** Whether prediction-based control (dehumidifier pre-start) is active (ADR-012) */
  controlEnabled: boolean | null
  modelVersion: string | null
  message: string | null
  metrics: PredictionMetric[]
}

// ---- Threshold recommendations (GET /api/recommendations) ----

export type KnownRecommendationStatus = 'PROPOSED' | 'APPLIED' | 'REJECTED' | 'REVERTED'

/** A suggested change to one automation threshold, learned from manual use; applied only on request */
export interface Recommendation {
  id: string
  /** The automation rule it targets; matches `AutomationRule.id` / `metric` */
  metric: string
  current: number | null
  proposed: number
  status: KnownRecommendationStatus | (string & {})
  /** How many manual operations the suggestion is based on */
  evidenceCount: number | null
  reason: string | null
  createdAt: string | null
  appliedAt: string | null
}

export interface RecommendationList {
  items: Recommendation[]
  /** While there isn't enough data for a recommendation yet: n of the required count */
  progress: { count: number; required: number } | null
}

// ---- Automation rules (GET/PUT /api/automation) ----

export interface AutomationRule {
  id: string
  metric: string
  threshold: number
  /** null when the server has no per-rule switch */
  enabled: boolean | null
  /** Server-provided display details win over the frontend catalog */
  label: string | null
  description: string | null
  unit: string | null
  min: number | null
  max: number | null
}

export interface Automation {
  /** Master switch; null when the server has none */
  enabled: boolean | null
  rules: AutomationRule[]
  /**
   * The response exactly as received. Saves are written back onto this so the server's own shape
   * and any field this client doesn't know survive (see automationModel.ts).
   */
  raw: unknown
}

// ---- Notifications (GET /api/notifications, WebSocket notification.new) ----

export interface AppNotification {
  id: string
  title: string | null
  body: string
  createdAt: string | null
  /** null when the server doesn't track read state; the app then tracks it locally */
  read: boolean | null
  /** Free-form server data, e.g. { type: "device.command", deviceId } */
  data: Record<string, unknown>
}

import {
  isRecord,
  isString,
  parseCommandAck,
  parseDevice,
  parseEdgeStatus,
  parseNotification,
  parsePrediction,
  parseRecommendation,
  parseRecoveryReport,
  parseSensorReading,
} from '@/api/parsers'
import type {
  AppNotification,
  CommandAck,
  Device,
  EdgeRecoveryReport,
  EdgeStatus,
  Prediction,
  Recommendation,
  SensorReading,
} from '@/api/types'

/**
 * Messages pushed by the cloud server over WebSocket (SAD 10.3 ③).
 * Envelope: `{ "type": string, "payload": object }`, JSON-encoded text frames.
 */
export type ServerMessage =
  | { type: 'sensor.update'; payload: SensorReading }
  | { type: 'device.state'; payload: Device }
  | { type: 'edge.status'; payload: EdgeStatus }
  | { type: 'edge.recovered'; payload: EdgeRecoveryReport }
  | { type: 'command.ack'; payload: CommandAck }
  /** A new AI prediction (every ~10 minutes) */
  | { type: 'forecast.update'; payload: Prediction }
  /** A new threshold recommendation; applying it is up to the user */
  | { type: 'recommendation.new'; payload: Recommendation }
  /** A new entry for the notification list */
  | { type: 'notification.new'; payload: AppNotification }
  /**
   * Liveness only, carries no data. The server must send one at least every
   * HEARTBEAT_INTERVAL_MS even when it has nothing else to report, so the client can
   * tell a quiet connection from a dead one. Also sent in reply to the client's ping.
   */
  | { type: 'heartbeat'; payload?: unknown }

type Parser<T> = (value: unknown) => T | null

const lenient =
  <T>(parse: (v: unknown) => T): Parser<T> =>
  (v) => {
    try {
      return parse(v)
    } catch {
      return null
    }
  }

const payloadParsers: { [K in ServerMessage['type']]: Parser<Extract<ServerMessage, { type: K }>['payload']> } = {
  'sensor.update': parseSensorReading,
  'device.state': parseDevice,
  'edge.status': parseEdgeStatus,
  'edge.recovered': parseRecoveryReport,
  'command.ack': parseCommandAck,
  'forecast.update': lenient(parsePrediction),
  'recommendation.new': parseRecommendation,
  'notification.new': parseNotification,
  heartbeat: (v) => v ?? {},
}

/** How often the server is expected to send a message (data or heartbeat). */
export const HEARTBEAT_INTERVAL_MS = 15_000

/** Sent by the client to probe a connection that has gone quiet; server replies with a heartbeat. */
export const PING_FRAME = JSON.stringify({ type: 'ping' })

/**
 * Parses a raw text frame into a normalized message. Returns null for malformed JSON, unknown
 * message types (ignored so the server can add new types without breaking older clients),
 * or payloads that don't match the contract.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || !isString(data.type) || !Object.hasOwn(payloadParsers, data.type)) return null

  const type = data.type as ServerMessage['type']
  const payload = (payloadParsers[type] as Parser<unknown>)(data.payload)
  return payload === null ? null : ({ type, payload } as ServerMessage)
}

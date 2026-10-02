import { useRealtimeStore } from '@/stores/realtime'
import { useEdgeStatus } from './queries'

export type SystemStatus =
  | { kind: 'checking' }
  /** The browser can't reach the cloud server (WebSocket down or REST failing) */
  | { kind: 'server-disconnected'; nextRetryAt: number | null }
  /** The cloud is up but no longer hears from the Raspberry Pi */
  | { kind: 'edge-offline'; lastSeenAt: string }
  /** The Pi is connected but running local auto-control instead of cloud decisions */
  | { kind: 'edge-local' }
  | { kind: 'ok' }

/** Single source of truth for the header badge and the connection banner. */
export function useSystemStatus(): SystemStatus {
  const wsStatus = useRealtimeStore((s) => s.status)
  const nextRetryAt = useRealtimeStore((s) => s.nextRetryAt)
  const edge = useEdgeStatus()

  if (wsStatus === 'reconnecting' || (edge.isError && !edge.data)) {
    return { kind: 'server-disconnected', nextRetryAt }
  }
  if (!edge.data) return { kind: 'checking' }
  if (!edge.data.online) return { kind: 'edge-offline', lastSeenAt: edge.data.lastSeenAt }
  if (edge.data.offlineMode) return { kind: 'edge-local' }
  return { kind: 'ok' }
}

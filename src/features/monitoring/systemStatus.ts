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

/** Commands can't reach the device in these states; null when controls are usable */
export function controlDisabledReason(status: SystemStatus): string | null {
  switch (status.kind) {
    case 'checking':
      return '연결 상태를 확인하는 중입니다.'
    case 'server-disconnected':
      return '서버와 연결되어 있지 않아 조작할 수 없습니다.'
    case 'edge-offline':
      return '기기(라즈베리파이)가 오프라인이라 조작할 수 없습니다.'
    default:
      return null
  }
}

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

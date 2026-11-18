import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { upsertDevice } from '@/api/deviceCache'
import { queryKeys } from '@/api/queryKeys'
import type { EdgeStatus, Prediction, SensorReading } from '@/api/types'
import { commandController } from '@/features/control/commands'
import { addNotification } from '@/features/notifications/queries'
import { upsertRecommendation } from '@/features/recommendation/queries'
import { changeText, isProposed, targetRule } from '@/features/recommendation/recommendations'
import { env } from '@/lib/env'
import { useRealtimeStore } from '@/stores/realtime'
import { showToast } from '@/stores/toasts'
import type { ServerMessage } from './protocol'
import { RealtimeClient } from './RealtimeClient'

const isNewer = (next: string, prev: string | undefined) => !prev || Date.parse(next) >= Date.parse(prev)

function applyMessage(queryClient: QueryClient, message: ServerMessage) {
  switch (message.type) {
    case 'sensor.update':
      // Frames can arrive out of order around reconnects; never replace newer data with older
      queryClient.setQueryData<SensorReading>(queryKeys.sensorsLatest, (prev) =>
        isNewer(message.payload.measuredAt, prev?.measuredAt) ? message.payload : prev,
      )
      break
    case 'device.state':
      // Pending commands watch the device cache, so they resolve from this too
      upsertDevice(queryClient, message.payload)
      break
    case 'command.ack':
      commandController.handleAck(message.payload)
      break
    case 'edge.status':
      queryClient.setQueryData<EdgeStatus>(queryKeys.edgeStatus, message.payload)
      break
    case 'forecast.update':
      queryClient.setQueryData<Prediction>(queryKeys.prediction, message.payload)
      break
    case 'recommendation.new': {
      upsertRecommendation(queryClient, message.payload)
      // Also covers the list not being loaded yet, and supersedes any older read still in flight
      void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations })
      if (isProposed(message.payload)) {
        const rule = targetRule(message.payload, queryClient.getQueryData<import('@/api/types').Automation>(queryKeys.automation)?.rules)
        showToast({
          tone: 'info',
          title: `새 기준값 추천: ${rule.label}`,
          detail: `${changeText(rule.current, message.payload.proposed, rule.unit)} · 예보·추천에서 적용할 수 있습니다`,
        })
      }
      break
    }
    case 'notification.new':
      addNotification(queryClient, message.payload)
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
      showToast({ tone: 'info', title: message.payload.title ?? '알림', detail: message.payload.title ? message.payload.body : undefined })
      break
    case 'heartbeat':
      // Liveness only; RealtimeClient already noted the frame
      break
    case 'edge.recovered':
      useRealtimeStore.setState({ recovery: message.payload })
      // The edge uploads what it measured and did while offline; pick it up
      void queryClient.invalidateQueries({ queryKey: queryKeys.sensorHistoryAll })
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices })
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
      break
  }
}

/** Everything a push can change, re-read after a gap in the connection */
const RESYNC_KEYS = [
  queryKeys.sensorsLatest,
  queryKeys.devices,
  queryKeys.edgeStatus,
  queryKeys.prediction,
  queryKeys.recommendations,
  queryKeys.notifications,
  queryKeys.automation,
  queryKeys.outdoor,
]

/** Opens one WebSocket for the app's lifetime and feeds pushed data into the query cache. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const client = new RealtimeClient({
      url: env.wsUrl,
      onMessage: (message) => applyMessage(queryClient, message),
      onStatusChange: ({ status, nextRetryAt, reconnected }) => {
        useRealtimeStore.setState({ status, nextRetryAt })
        // Pushes sent while we were disconnected are lost; resync from REST
        if (reconnected) for (const key of RESYNC_KEYS) void queryClient.invalidateQueries({ queryKey: key })
      },
    })
    useRealtimeStore.setState({ retryNow: () => client.retryNow() })
    client.start()
    return () => {
      client.stop()
      useRealtimeStore.setState({ retryNow: () => {} })
    }
  }, [queryClient])

  return children
}

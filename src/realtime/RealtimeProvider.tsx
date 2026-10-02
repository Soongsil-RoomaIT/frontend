import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { upsertDevice } from '@/api/deviceCache'
import { queryKeys } from '@/api/queryKeys'
import type { EdgeStatus, SensorReading } from '@/api/types'
import { commandController } from '@/features/control/commands'
import { env } from '@/lib/env'
import { useRealtimeStore } from '@/stores/realtime'
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
    case 'heartbeat':
      // Liveness only; RealtimeClient already noted the frame
      break
    case 'edge.recovered':
      useRealtimeStore.setState({ recovery: message.payload })
      // The edge uploads what it measured and did while offline; pick it up
      void queryClient.invalidateQueries({ queryKey: queryKeys.sensorHistoryAll })
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices })
      break
  }
}

/** Opens one WebSocket for the app's lifetime and feeds pushed data into the query cache. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const client = new RealtimeClient({
      url: env.wsUrl,
      onMessage: (message) => applyMessage(queryClient, message),
      onStatusChange: ({ status, nextRetryAt, reconnected }) => {
        useRealtimeStore.setState({ status, nextRetryAt })
        if (reconnected) {
          // Pushes sent while we were disconnected are lost; resync from REST
          void queryClient.invalidateQueries({ queryKey: queryKeys.sensorsLatest })
          void queryClient.invalidateQueries({ queryKey: queryKeys.devices })
          void queryClient.invalidateQueries({ queryKey: queryKeys.edgeStatus })
        }
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

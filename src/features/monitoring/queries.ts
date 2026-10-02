import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import { queryKeys } from '@/api/queryKeys'
import type { HistoryRange } from '@/api/types'

// These three are kept fresh by WebSocket pushes (RealtimeProvider) and resynced on reconnect,
// so they never go stale on their own. A REST refetch could otherwise overwrite a newer push.
export const useLatestSensors = () =>
  useQuery({ queryKey: queryKeys.sensorsLatest, queryFn: api.getLatestSensors, staleTime: Infinity })

export const useDevices = () => useQuery({ queryKey: queryKeys.devices, queryFn: api.getDevices, staleTime: Infinity })

export const useEdgeStatus = () =>
  useQuery({ queryKey: queryKeys.edgeStatus, queryFn: api.getEdgeStatus, staleTime: Infinity })

const historyRefreshMs: Record<HistoryRange, number> = {
  '1h': 60_000,
  '24h': 5 * 60_000,
  '7d': 30 * 60_000,
}

export const useSensorHistory = (range: HistoryRange) =>
  useQuery({
    queryKey: queryKeys.sensorHistory(range),
    queryFn: () => api.getSensorHistory(range),
    staleTime: historyRefreshMs[range],
    refetchInterval: historyRefreshMs[range],
    // Keep showing the previous range's chart (dimmed) while the new one loads
    placeholderData: keepPreviousData,
  })

import { create } from 'zustand'
import type { EdgeRecoveryReport } from '@/api/types'
import type { ConnectionStatus } from '@/realtime/RealtimeClient'

interface RealtimeState {
  status: ConnectionStatus
  nextRetryAt: number | null
  /** Latest edge recovery report, shown until the user dismisses it */
  recovery: EdgeRecoveryReport | null
  retryNow: () => void
}

export const useRealtimeStore = create<RealtimeState>()(() => ({
  status: 'idle',
  nextRetryAt: null,
  recovery: null,
  retryNow: () => {},
}))

export const dismissRecovery = () => useRealtimeStore.setState({ recovery: null })

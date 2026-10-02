import type { HistoryRange } from './types'

export const queryKeys = {
  sensorsLatest: ['sensors', 'latest'] as const,
  sensorHistory: (range: HistoryRange) => ['sensors', 'history', range] as const,
  sensorHistoryAll: ['sensors', 'history'] as const,
  devices: ['devices'] as const,
  edgeStatus: ['edge', 'status'] as const,
}

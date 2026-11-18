import type { HistoryRange } from './types'

export const queryKeys = {
  sensorsLatest: ['sensors', 'latest'] as const,
  sensorHistory: (range: HistoryRange) => ['sensors', 'history', range] as const,
  sensorHistoryAll: ['sensors', 'history'] as const,
  devices: ['devices'] as const,
  edgeStatus: ['edge', 'status'] as const,
  outdoor: ['outdoor'] as const,
  prediction: ['prediction'] as const,
  recommendations: ['recommendations'] as const,
  automation: ['automation'] as const,
  notifications: ['notifications'] as const,
}

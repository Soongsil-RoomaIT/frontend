import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import { queryKeys } from '@/api/queryKeys'

/** Predictions are pushed as `forecast.update` (every ~10 min); polling covers a missed push */
export const PREDICTION_REFRESH_MS = 5 * 60_000

export const usePrediction = () =>
  useQuery({
    queryKey: queryKeys.prediction,
    queryFn: api.getPrediction,
    staleTime: PREDICTION_REFRESH_MS / 2,
    refetchInterval: PREDICTION_REFRESH_MS,
  })

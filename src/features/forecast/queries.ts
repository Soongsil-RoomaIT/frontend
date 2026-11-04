import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, serverMessage } from '@/api/client'
import { api } from '@/api/endpoints'
import { queryKeys } from '@/api/queryKeys'
import { isDecision } from '@/realtime/protocol'
import { showToast } from '@/stores/toasts'
import { upsertDecision } from './decisionCache'

/**
 * Pushes cover new recommendations, but a recommendation can also expire on the server without
 * any message, and the weather changes on its own, so this keeps polling as well.
 */
const FORECAST_REFRESH_MS = 60_000

export const useForecast = () =>
  useQuery({
    queryKey: queryKeys.forecast,
    queryFn: api.getForecast,
    staleTime: FORECAST_REFRESH_MS / 2,
    refetchInterval: FORECAST_REFRESH_MS,
  })

export type DecisionVerb = 'approve' | 'reject'

function actionFailure(error: unknown, verb: DecisionVerb): string {
  const fromServer = serverMessage(error)
  if (fromServer) return fromServer
  if (!(error instanceof ApiError)) return '서버에 연결할 수 없습니다.'
  if (error.status === 404 || error.status === 409) return '이미 처리되었거나 만료된 추천입니다.'
  if (error.status === 503) return '기기와 연결되어 있지 않습니다.'
  return verb === 'approve' ? '추천을 승인하지 못했습니다.' : '추천을 거절하지 못했습니다.'
}

export function useDecisionAction(decisionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (verb: DecisionVerb) =>
      verb === 'approve' ? api.approveDecision(decisionId) : api.rejectDecision(decisionId),
    onSuccess: (response) => {
      if (isDecision(response)) upsertDecision(queryClient, response)
    },
    onError: (error, verb) => {
      showToast({
        tone: 'error',
        title: verb === 'approve' ? '승인하지 못했습니다' : '거절하지 못했습니다',
        detail: actionFailure(error, verb),
      })
    },
    // Returned so the buttons stay busy until the list reflects the result. Also cancels any
    // refetch already in flight, whose older answer would otherwise undo the status just set.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.forecast }),
  })
}

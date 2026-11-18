import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, serverMessage } from '@/api/client'
import { api } from '@/api/endpoints'
import { queryKeys } from '@/api/queryKeys'
import type { Recommendation, RecommendationList } from '@/api/types'
import { showToast } from '@/stores/toasts'

/** New ones are pushed as `recommendation.new`; polling covers a missed push and status changes */
export const RECOMMENDATION_REFRESH_MS = 5 * 60_000

export const useRecommendations = () =>
  useQuery({
    queryKey: queryKeys.recommendations,
    queryFn: api.getRecommendations,
    staleTime: RECOMMENDATION_REFRESH_MS / 2,
    refetchInterval: RECOMMENDATION_REFRESH_MS,
  })

export type RecommendationVerb = 'apply' | 'reject' | 'revert'

const verbLabel: Record<RecommendationVerb, string> = { apply: '적용', reject: '거절', revert: '되돌리기' }

function actionFailure(error: unknown, verb: RecommendationVerb): string {
  const fromServer = serverMessage(error)
  if (fromServer) return fromServer
  if (!(error instanceof ApiError)) return '서버에 연결할 수 없습니다.'
  if (error.status === 404 || error.status === 409) return '이미 처리된 추천입니다. 목록을 다시 불러옵니다.'
  return `추천을 ${verbLabel[verb]}하지 못했습니다.`
}

/** Puts one recommendation into the cached list (newest first). No-op before the list has loaded. */
export function upsertRecommendation(
  queryClient: ReturnType<typeof useQueryClient>,
  recommendation: Recommendation,
) {
  queryClient.setQueryData<RecommendationList>(queryKeys.recommendations, (list) => {
    if (!list) return list
    const known = list.items.some((r) => r.id === recommendation.id)
    return {
      ...list,
      items: known
        ? list.items.map((r) => (r.id === recommendation.id ? recommendation : r))
        : [recommendation, ...list.items],
    }
  })
}

export function useRecommendationAction(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (verb: RecommendationVerb) => api.actOnRecommendation(id, verb),
    onSuccess: (updated) => {
      if (updated) upsertRecommendation(queryClient, updated)
      // Applying changes a threshold; reverting changes it back
      void queryClient.invalidateQueries({ queryKey: queryKeys.automation })
    },
    onError: (error, verb) =>
      showToast({ tone: 'error', title: `${verbLabel[verb]}하지 못했습니다`, detail: actionFailure(error, verb) }),
    // Returned so the buttons stay busy until the list reflects the result; also supersedes an
    // in-flight refetch whose older answer would otherwise undo the status just set
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.recommendations }),
  })
}

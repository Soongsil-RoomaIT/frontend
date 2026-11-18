import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, serverMessage } from '@/api/client'
import { api } from '@/api/endpoints'
import { queryKeys } from '@/api/queryKeys'
import { showToast } from '@/stores/toasts'
import { applyAutomationChange, parseAutomation, type AutomationChange } from './automationModel'

const fetchAutomation = async () => parseAutomation(await api.getAutomationRaw())

export const useAutomation = () =>
  useQuery({ queryKey: queryKeys.automation, queryFn: fetchAutomation, staleTime: 30_000 })

function saveFailure(error: unknown) {
  const fromServer = serverMessage(error)
  if (fromServer) return fromServer
  return error instanceof ApiError ? '설정을 저장하지 못했습니다.' : '서버에 연결할 수 없습니다.'
}

/**
 * Saves a change. The API replaces the whole object, so the change is written onto a fresh read:
 * writing onto the cache could undo what another device changed in the meantime. `scope` runs
 * saves one at a time. The screen only changes after the server accepts: these settings move
 * real devices.
 */
export function useUpdateAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    scope: { id: 'automation' },
    mutationFn: async (change: AutomationChange) => {
      const current = await queryClient.fetchQuery({
        queryKey: queryKeys.automation,
        queryFn: fetchAutomation,
        staleTime: 0,
        retry: false, // the user is waiting on this save; fail fast and let them retry
      })
      const body = applyAutomationChange(current, change)
      const saved = await api.putAutomationRaw(body)
      // A server may answer 204; what we sent is then what's stored
      try {
        return parseAutomation(saved)
      } catch {
        return parseAutomation(body)
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.automation, saved)
      // A threshold change can retire a recommendation that targeted it
      void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations })
    },
    onError: (error) => showToast({ tone: 'error', title: '설정 저장 실패', detail: saveFailure(error) }),
  })
}

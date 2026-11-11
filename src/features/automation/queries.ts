import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, serverMessage } from '@/api/client'
import { api } from '@/api/endpoints'
import { queryKeys } from '@/api/queryKeys'
import type { AutomationSettings } from '@/api/types'
import { showToast } from '@/stores/toasts'

export const useAutomationSettings = () =>
  useQuery({ queryKey: queryKeys.automationSettings, queryFn: api.getAutomationSettings, staleTime: 30_000 })

function saveFailure(error: unknown) {
  const fromServer = serverMessage(error)
  if (fromServer) return fromServer
  return error instanceof ApiError ? '설정을 저장하지 못했습니다.' : '서버에 연결할 수 없습니다.'
}

/**
 * Saves a partial change. The API replaces the whole object, so it's merged onto a fresh read:
 * merging onto the cache could undo what another device changed in the meantime. `scope` runs
 * saves one at a time, so a second change merges onto the first.
 * The screen only changes after the server accepts: these settings move real devices.
 */
export function useUpdateAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    scope: { id: 'automation-settings' },
    mutationFn: async (patch: Partial<AutomationSettings>) => {
      const current = await queryClient.fetchQuery({
        queryKey: queryKeys.automationSettings,
        queryFn: api.getAutomationSettings,
        staleTime: 0,
        retry: false, // the user is waiting on this save; fail fast and let them retry
      })
      return api.updateAutomationSettings({ ...current, ...patch })
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.automationSettings, saved)
      // Turning automation off or changing thresholds can retire open recommendations
      void queryClient.invalidateQueries({ queryKey: queryKeys.forecast })
    },
    onError: (error) => showToast({ tone: 'error', title: '설정 저장 실패', detail: saveFailure(error) }),
  })
}

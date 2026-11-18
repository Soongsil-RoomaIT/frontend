import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { api } from '@/api/endpoints'
import { queryKeys } from '@/api/queryKeys'
import type { AppNotification } from '@/api/types'
import { useNotificationsSeenStore } from '@/stores/notificationsSeen'
import { countUnread, prependNotification } from './unread'

/** New ones are pushed as `notification.new`; polling covers a missed push */
export const NOTIFICATIONS_REFRESH_MS = 2 * 60_000

export const useNotifications = () =>
  useQuery({
    queryKey: queryKeys.notifications,
    queryFn: api.getNotifications,
    staleTime: NOTIFICATIONS_REFRESH_MS / 2,
    refetchInterval: NOTIFICATIONS_REFRESH_MS,
  })

export function useUnreadCount() {
  const { data } = useNotifications()
  const seenAtMs = useNotificationsSeenStore((s) => s.seenAtMs)
  return countUnread(data, seenAtMs)
}

export function addNotification(queryClient: QueryClient, n: AppNotification) {
  queryClient.setQueryData<AppNotification[]>(queryKeys.notifications, (items) =>
    items ? prependNotification(items, n) : items,
  )
}

/** The server told us once that it has no read endpoint; don't keep asking */
let serverTracksRead = true

/**
 * Marks server-tracked notifications read, best effort. Local "seen" state is updated by the
 * page regardless, so a server without this endpoint still gets a correct badge.
 */
export function useMarkRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!serverTracksRead) return []
      const done: string[] = []
      for (const id of ids) {
        try {
          await api.markNotificationRead(id)
          done.push(id)
        } catch (error) {
          if (error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 501)) {
            serverTracksRead = false
            break
          }
          // A transient failure: the rest can still be tried next time
          break
        }
      }
      return done
    },
    onSuccess: (done) => {
      if (done.length === 0) return
      queryClient.setQueryData<AppNotification[]>(queryKeys.notifications, (items) =>
        items?.map((n) => (done.includes(n.id) ? { ...n, read: true } : n)),
      )
    },
  })
}

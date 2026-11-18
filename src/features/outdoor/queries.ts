import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import { queryKeys } from '@/api/queryKeys'

/** The server refreshes public data every 30 minutes; a 5-minute poll follows it closely enough */
export const OUTDOOR_REFRESH_MS = 5 * 60_000

export const useOutdoor = () =>
  useQuery({
    queryKey: queryKeys.outdoor,
    queryFn: api.getOutdoor,
    staleTime: OUTDOOR_REFRESH_MS / 2,
    refetchInterval: OUTDOOR_REFRESH_MS,
  })

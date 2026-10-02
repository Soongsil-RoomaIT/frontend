import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'
import type { Device } from './types'

const isNewer = (next: string, prev: string) => Date.parse(next) >= Date.parse(prev)

/**
 * Puts one device into the cached list, newest-wins. An unknown device (or a list not
 * loaded yet) triggers a full refetch instead of guessing where it belongs.
 */
export function upsertDevice(queryClient: QueryClient, device: Device) {
  const devices = queryClient.getQueryData<Device[]>(queryKeys.devices)
  if (!devices?.some((d) => d.id === device.id)) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.devices })
    return
  }
  queryClient.setQueryData<Device[]>(queryKeys.devices, (prev) =>
    prev?.map((d) => (d.id === device.id && isNewer(device.updatedAt, d.updatedAt) ? device : d)),
  )
}

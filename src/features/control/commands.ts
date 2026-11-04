import { api } from '@/api/endpoints'
import { upsertDevice } from '@/api/deviceCache'
import { queryKeys } from '@/api/queryKeys'
import type { Device } from '@/api/types'
import { queryClient } from '@/app/queryClient'
import { randomId } from '@/lib/id'
import { clearCommandError, useCommandStore } from '@/stores/commands'
import { showToast } from '@/stores/toasts'
import { actionLabel } from './catalog'
import { createCommandController } from './commandController'

/** App-wide controller: commands keep running (and report) even if the user leaves the page. */
export const commandController = createCommandController({
  send: api.sendDeviceCommand,
  applyDevice: (device) => upsertDevice(queryClient, device),
  refetchDevices: () => queryClient.fetchQuery({ queryKey: queryKeys.devices, queryFn: api.getDevices, staleTime: 0 }),
  subscribeDevices: (listener) =>
    queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.query.queryKey[0] !== queryKeys.devices[0]) return
      const data = event.query.state.data as Device[] | undefined
      if (data) listener(data)
    }),
  onPendingChange: (pending) => useCommandStore.setState({ pending }),
  onOutcome: ({ command, ok, reason, latencyMs }) => {
    const what = `${command.deviceName} ${actionLabel[command.action]}`
    if (import.meta.env.DEV) console.info(`[command] ${what} ${ok ? 'ok' : 'failed'} in ${latencyMs}ms`)
    if (ok) {
      showToast({ tone: 'success', title: `${what} 완료` })
    } else {
      useCommandStore.setState((s) => ({ lastError: { ...s.lastError, [command.deviceId]: reason ?? '' } }))
      showToast({ tone: 'error', title: `${what} 실패`, detail: reason })
    }
  },
  createKey: randomId,
})

export function runDeviceCommand(...args: Parameters<typeof commandController.run>) {
  clearCommandError(args[0].id)
  return commandController.run(...args)
}

// Dev hot reload re-creates this module; drop the old instance's cache subscription and timers
import.meta.hot?.dispose(() => commandController.dispose())

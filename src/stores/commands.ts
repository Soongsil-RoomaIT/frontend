import { create } from 'zustand'
import type { PendingCommand } from '@/features/control/commandController'

interface CommandState {
  /** In-flight commands by deviceId */
  pending: Readonly<Record<string, PendingCommand>>
  /** Last failure per device, shown on its card until the next attempt or dismissal */
  lastError: Readonly<Record<string, string>>
}

export const useCommandStore = create<CommandState>()(() => ({ pending: {}, lastError: {} }))

export const clearCommandError = (deviceId: string) =>
  useCommandStore.setState((s) => {
    const { [deviceId]: _removed, ...rest } = s.lastError
    return { lastError: rest }
  })

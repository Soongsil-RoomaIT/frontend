import { ApiError, serverMessage } from '@/api/client'
import type { CommandAck, CommandResponse, Device, DeviceAction, DeviceState } from '@/api/types'
import { targetState } from './catalog'

/**
 * How long to wait for a command's outcome before checking the device's real state.
 * NFR-02 asks for 5s, but a window motor may take longer; past this we stop waiting.
 */
export const COMMAND_TIMEOUT_MS = 20_000

/** How long an ack that arrived before its HTTP response is kept around */
const EARLY_ACK_TTL_MS = 30_000

export interface PendingCommand {
  /** Local id, also sent as the Idempotency-Key */
  key: string
  /** Server id once the request is accepted; null while sending, or if the server didn't give one */
  commandId: string | null
  deviceId: string
  deviceName: string
  action: DeviceAction
  target: DeviceState
  startedAt: number
  /** Device's updatedAt when the command started; only newer updates count as confirmation */
  baseUpdatedAt: number
}

export interface CommandOutcome {
  command: PendingCommand
  ok: boolean
  /** Failure reason, shown to the user */
  reason?: string
  latencyMs: number
}

export interface CommandControllerDeps {
  send: (deviceId: string, action: DeviceAction, key: string) => Promise<CommandResponse | undefined>
  /** Upserts a device into the cache (newer-wins) */
  applyDevice: (device: Device) => void
  /** Fresh device list from the server; rejects on failure */
  refetchDevices: () => Promise<Device[]>
  /** Calls back whenever the cached device list changes; returns an unsubscribe */
  subscribeDevices: (listener: (devices: Device[]) => void) => () => void
  onPendingChange: (pending: Readonly<Record<string, PendingCommand>>) => void
  onOutcome: (outcome: CommandOutcome) => void
  createKey: () => string
  now?: () => number
  timeoutMs?: number
}

const NO_RESPONSE = '기기 응답이 없습니다. 실제 상태를 확인해 주세요.'

/** User-facing reason for a failed request */
export function failureReason(error: unknown): string {
  const fromServer = serverMessage(error)
  if (fromServer) return fromServer
  if (!(error instanceof ApiError)) return '서버에 연결할 수 없습니다. 기기 상태를 확인해 주세요.'
  switch (error.status) {
    case 400:
    case 422:
      return '지원하지 않는 명령입니다.'
    case 401:
    case 403:
      return '이 기기를 조작할 권한이 없습니다.'
    case 404:
      return '기기를 찾을 수 없습니다.'
    case 409:
      return '기기가 다른 명령을 처리하고 있습니다.'
    case 503:
      return '기기와 연결되어 있지 않습니다.'
    default:
      return error.status >= 500 ? '서버 오류로 명령을 보내지 못했습니다.' : '명령을 보내지 못했습니다.'
  }
}

/**
 * Tracks in-flight device commands and resolves each from whichever signal arrives first:
 * a synchronous response, a `command.ack`, the device reaching its target state in the
 * cache (covers servers that only push `device.state`), or a timeout that re-checks state.
 *
 * Nothing is written to the device cache until the server confirms, so a failure needs no
 * rollback of data: the UI simply stops showing the pending intent.
 */
export function createCommandController(deps: CommandControllerDeps) {
  const now = deps.now ?? Date.now
  const timeoutMs = deps.timeoutMs ?? COMMAND_TIMEOUT_MS

  const pending = new Map<string, PendingCommand>() // by deviceId
  const timers = new Map<string, ReturnType<typeof setTimeout>>() // by deviceId
  const earlyAcks = new Map<string, { ack: CommandAck; at: number }>() // by commandId

  const emit = () => deps.onPendingChange(Object.fromEntries(pending))

  const current = (key: string) => {
    for (const cmd of pending.values()) if (cmd.key === key) return cmd
    return undefined
  }

  /** The device is in the commanded state. Enough when the server explicitly reported the outcome. */
  const reached = (cmd: PendingCommand, device: Device) => device.id === cmd.deviceId && device.state === cmd.target

  /**
   * Stricter, for implicit confirmation from cache updates: the state must also be *newer* than
   * when the command started, so a late, out-of-order message can't fake a success.
   */
  const confirms = (cmd: PendingCommand, device: Device) =>
    reached(cmd, device) && Date.parse(device.updatedAt) > cmd.baseUpdatedAt

  function finish(key: string, ok: boolean, reason?: string) {
    const cmd = current(key)
    if (!cmd) return
    clearTimeout(timers.get(cmd.deviceId))
    timers.delete(cmd.deviceId)
    pending.delete(cmd.deviceId)
    emit()
    deps.onOutcome({ command: cmd, ok, reason: ok ? undefined : reason, latencyMs: now() - cmd.startedAt })
  }

  /** Success without the updated device in hand: fetch the truth before declaring done */
  async function succeedAfterSync(key: string) {
    try {
      const devices = await deps.refetchDevices()
      const cmd = current(key)
      const device = cmd && devices.find((d) => d.id === cmd.deviceId)
      // The cache subscription may already have finished it; finish() ignores a done key
      if (cmd && device && !reached(cmd, device)) {
        // Server said done but its list disagrees; trust the list rather than guess
        finish(key, false, NO_RESPONSE)
        return
      }
    } catch {
      // Couldn't verify; the server did report success
    }
    finish(key, true)
  }

  function applyResult(cmd: PendingCommand, status: 'EXECUTED' | 'FAILED', reason?: string, device?: Device) {
    if (device) deps.applyDevice(device)
    if (status === 'FAILED') {
      finish(cmd.key, false, reason?.trim() || '기기가 명령을 수행하지 못했습니다.')
    } else if (device && reached(cmd, device)) {
      finish(cmd.key, true)
    } else {
      void succeedAfterSync(cmd.key)
    }
  }

  function handleResponse(key: string, res: CommandResponse | undefined) {
    const cmd = current(key)
    if (!cmd) return // already resolved (e.g. the device reached its target first)

    // Anything without a recognizable status (204, a bare Device, ...) is treated as
    // "accepted": the cache subscription or the timeout will settle it.
    const status = res && typeof res === 'object' ? res.status : undefined
    if (status === 'EXECUTED' || status === 'FAILED') {
      applyResult(cmd, status, res?.reason, res?.device)
      return
    }

    const commandId = res && typeof res.commandId === 'string' ? res.commandId : null
    if (commandId) {
      cmd.commandId = commandId
      emit()
      const early = earlyAcks.get(commandId)
      if (early) {
        earlyAcks.delete(commandId)
        handleAck(early.ack)
      }
    }
  }

  async function handleTimeout(key: string) {
    if (!current(key)) return
    try {
      const devices = await deps.refetchDevices()
      const cmd = current(key)
      const device = cmd && devices.find((d) => d.id === cmd.deviceId)
      // A fresh REST read is current truth, so reaching the target is enough here
      if (cmd && device && reached(cmd, device)) {
        finish(key, true)
        return
      }
    } catch {
      // fall through to failure
    }
    finish(key, false, NO_RESPONSE)
  }

  function handleAck(ack: CommandAck) {
    const cmd = pending.get(ack.deviceId)
    if (!cmd || cmd.commandId !== ack.commandId) {
      if (ack.device) deps.applyDevice(ack.device)
      // May belong to a command whose HTTP response hasn't arrived yet
      if (cmd && cmd.commandId === null) {
        const t = now()
        for (const [id, e] of earlyAcks) if (t - e.at > EARLY_ACK_TTL_MS) earlyAcks.delete(id)
        earlyAcks.set(ack.commandId, { ack, at: t })
      }
      return
    }
    applyResult(cmd, ack.status, ack.reason, ack.device)
  }

  const unsubscribe = deps.subscribeDevices((devices) => {
    for (const cmd of [...pending.values()]) {
      const device = devices.find((d) => d.id === cmd.deviceId)
      if (device && confirms(cmd, device)) finish(cmd.key, true)
    }
  })

  return {
    /** Starts a command. Returns false if the device already has one in flight or is already there. */
    run(device: Device, action: DeviceAction): boolean {
      const target = targetState[action]
      if (pending.has(device.id) || device.state === target) return false

      const cmd: PendingCommand = {
        key: deps.createKey(),
        commandId: null,
        deviceId: device.id,
        deviceName: device.name,
        action,
        target,
        startedAt: now(),
        baseUpdatedAt: Date.parse(device.updatedAt),
      }
      pending.set(device.id, cmd)
      timers.set(
        device.id,
        setTimeout(() => void handleTimeout(cmd.key), timeoutMs),
      )
      emit()

      deps.send(device.id, action, cmd.key).then(
        (res) => handleResponse(cmd.key, res),
        (error: unknown) => finish(cmd.key, false, failureReason(error)),
      )
      return true
    },

    handleAck,

    dispose() {
      unsubscribe()
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      pending.clear()
      earlyAcks.clear()
    },
  }
}

export type CommandController = ReturnType<typeof createCommandController>

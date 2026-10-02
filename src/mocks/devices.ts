import type { CommandResponse, Device, DeviceAction, DeviceState } from '@/api/types'
import { broadcast } from './bus'
import { state } from './data'

/** What the fake server accepts per device type (a real server decides this itself) */
const ACCEPTED: Record<string, DeviceAction[]> = {
  WINDOW: ['OPEN', 'CLOSE'],
  DEHUMIDIFIER: ['ON', 'OFF'],
  AIR_PURIFIER: ['ON', 'OFF'],
  FRONT_DOOR: ['CLOSE'],
}

/** Motor vs relay: windows and doors take a moment, appliances switch fast */
const EXECUTION_MS: Record<string, number> = { WINDOW: 2_500, FRONT_DOOR: 2_000 }
const DEFAULT_EXECUTION_MS = 700
/** In timeout mode, the device stays busy this long before the server gives up on it */
const TIMEOUT_MODE_BUSY_MS = 25_000

const TARGET: Record<DeviceAction, DeviceState> = { OPEN: 'OPEN', CLOSE: 'CLOSED', ON: 'ON', OFF: 'OFF' }
const isAction = (v: unknown): v is DeviceAction => typeof v === 'string' && Object.hasOwn(TARGET, v)

let commandSeq = 1
const busy = new Set<string>()
/** Idempotency-Key → first response, so a repeated request doesn't move the device twice */
const seenKeys = new Map<string, { status: number; body: CommandResponse }>()
let doorTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Single place device state changes, so derived fields stay right: a front door that opens
 * gets an `autoCloseAt` deadline and a timer that closes it (FR-03).
 */
export function setDeviceState(deviceId: string, next: DeviceState, opts: { at?: number; push?: boolean } = {}) {
  const at = opts.at ?? Date.now()
  let changed: Device | undefined
  state.devices = state.devices.map((d) => {
    if (d.id !== deviceId) return d
    const { autoCloseAt: _old, ...rest } = d
    changed = { ...rest, state: next, updatedAt: new Date(at).toISOString() }
    if (d.type === 'FRONT_DOOR' && next === 'OPEN') {
      changed.autoCloseAt = new Date(at + state.doorAutoCloseMs).toISOString()
    }
    return changed
  })
  if (!changed) return undefined

  if (changed.type === 'FRONT_DOOR') {
    if (doorTimer) clearTimeout(doorTimer)
    doorTimer = null
    if (changed.autoCloseAt) {
      const delay = Math.max(0, Date.parse(changed.autoCloseAt) - Date.now())
      const id = changed.id
      doorTimer = setTimeout(() => {
        doorTimer = null
        if (state.devices.find((d) => d.id === id)?.state === 'OPEN') setDeviceState(id, 'CLOSED')
      }, delay)
    }
  }
  if (opts.push !== false) broadcast({ type: 'device.state', payload: changed })
  return changed
}

/** Panel helper: flips a device as if someone used it by hand */
export function toggleDevice(type: Device['type']) {
  const d = state.devices.find((x) => x.type === type)
  if (!d) return
  const flip: Record<DeviceState, DeviceState> = { OPEN: 'CLOSED', CLOSED: 'OPEN', ON: 'OFF', OFF: 'ON' }
  setDeviceState(d.id, flip[d.state])
}

type Result = { status: number; body: CommandResponse | { message: string } }

/** Fake server's handling of POST /api/devices/:id/commands */
export function handleCommand(deviceId: string, rawAction: unknown, idempotencyKey: string | null): Result {
  if (state.serverDown) return { status: 503, body: { message: '서버를 사용할 수 없습니다 (시뮬레이션)' } }

  if (idempotencyKey) {
    const seen = seenKeys.get(idempotencyKey)
    if (seen) return seen
  }

  const device = state.devices.find((d) => d.id === deviceId)
  if (!device) return { status: 404, body: { message: '기기를 찾을 수 없습니다.' } }
  if (!isAction(rawAction)) return { status: 422, body: { message: '알 수 없는 명령입니다.' } }
  const action = rawAction
  if (!(device.actions ?? ACCEPTED[device.type] ?? []).includes(action)) {
    return { status: 422, body: { message: '이 기기는 해당 명령을 지원하지 않습니다.' } }
  }
  if (!state.edge.online) return { status: 503, body: { message: '기기(라즈베리파이)가 오프라인입니다.' } }
  if (busy.has(deviceId)) return { status: 409, body: { message: '이전 명령을 처리하고 있습니다.' } }

  const commandId = `cmd-${commandSeq++}`
  const target = TARGET[action]
  let result: Result

  if (state.commandMode === 'sync') {
    const updated = setDeviceState(deviceId, target)
    result = { status: 200, body: { commandId, status: 'EXECUTED', device: updated } }
  } else {
    busy.add(deviceId)
    const release = () => busy.delete(deviceId)

    if (state.commandMode === 'normal') {
      setTimeout(() => {
        release()
        const updated = setDeviceState(deviceId, target)
        broadcast({ type: 'command.ack', payload: { commandId, deviceId, status: 'EXECUTED', device: updated } })
      }, EXECUTION_MS[device.type] ?? DEFAULT_EXECUTION_MS)
    } else if (state.commandMode === 'fail') {
      setTimeout(() => {
        release()
        const reason = device.type === 'WINDOW' ? '창문 모터 과부하가 감지되어 중지했습니다.' : '기기가 응답하지 않습니다.'
        broadcast({ type: 'command.ack', payload: { commandId, deviceId, status: 'FAILED', reason } })
      }, 1_200)
    } else {
      // timeout: accepted, then silence
      setTimeout(release, TIMEOUT_MODE_BUSY_MS)
    }
    result = { status: 202, body: { commandId, status: 'PENDING' } }
  }

  if (idempotencyKey) seenKeys.set(idempotencyKey, result as { status: number; body: CommandResponse })
  return result
}

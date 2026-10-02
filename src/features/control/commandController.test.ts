import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type { CommandAck, CommandResponse, Device } from '@/api/types'
import {
  COMMAND_TIMEOUT_MS,
  createCommandController,
  type CommandOutcome,
  type PendingCommand,
} from './commandController'

const T0 = Date.parse('2026-10-02T10:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

const windowClosed: Device = {
  id: 'window-1',
  type: 'WINDOW',
  name: '창문',
  state: 'CLOSED',
  updatedAt: iso(T0 - 60_000),
}
const opened = (at = T0 + 1_000): Device => ({ ...windowClosed, state: 'OPEN', updatedAt: iso(at) })

/** Lets pending promise chains settle (microtasks only; setTimeout is faked) */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function setup(opts: { send?: () => Promise<CommandResponse | undefined>; refetch?: () => Promise<Device[]> } = {}) {
  let resolveSend!: (v: CommandResponse | undefined) => void
  let rejectSend!: (e: unknown) => void
  const send = vi.fn(
    opts.send ??
      (() =>
        new Promise<CommandResponse | undefined>((res, rej) => {
          resolveSend = res
          rejectSend = rej
        })),
  )
  const applyDevice = vi.fn()
  const refetchDevices = vi.fn(opts.refetch ?? (async () => [windowClosed]))
  let deviceListener: (d: Device[]) => void = () => {}
  const outcomes: CommandOutcome[] = []
  let pending: Readonly<Record<string, PendingCommand>> = {}
  let keyN = 0

  const ctrl = createCommandController({
    send,
    applyDevice,
    refetchDevices,
    subscribeDevices: (l) => {
      deviceListener = l
      return () => {}
    },
    onPendingChange: (p) => (pending = p),
    onOutcome: (o) => outcomes.push(o),
    createKey: () => `key-${++keyN}`,
  })

  return {
    ctrl,
    send,
    applyDevice,
    refetchDevices,
    outcomes,
    get pending() {
      return pending
    },
    resolveSend: (v: CommandResponse | undefined) => resolveSend(v),
    rejectSend: (e: unknown) => rejectSend(e),
    pushDevices: (d: Device[]) => deviceListener(d),
  }
}

const ack = (status: CommandAck['status'], extra: Partial<CommandAck> = {}): CommandAck => ({
  commandId: 'cmd-1',
  deviceId: 'window-1',
  status,
  ...extra,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(T0)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('starting a command', () => {
  it('sends with the idempotency key and tracks it as pending', () => {
    const t = setup()
    expect(t.ctrl.run(windowClosed, 'OPEN')).toBe(true)
    expect(t.send).toHaveBeenCalledWith('window-1', 'OPEN', 'key-1')
    expect(t.pending['window-1']).toMatchObject({ action: 'OPEN', target: 'OPEN', commandId: null })
  })

  it('ignores a second press while one is in flight', () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    expect(t.ctrl.run(windowClosed, 'OPEN')).toBe(false)
    expect(t.send).toHaveBeenCalledTimes(1)
  })

  it('refuses an action that would not change the state', () => {
    const t = setup()
    expect(t.ctrl.run(windowClosed, 'CLOSE')).toBe(false)
    expect(t.send).not.toHaveBeenCalled()
  })

  it('tracks different devices independently', () => {
    const t = setup()
    const purifier: Device = { ...windowClosed, id: 'purifier-1', type: 'AIR_PURIFIER', state: 'OFF' }
    expect(t.ctrl.run(windowClosed, 'OPEN')).toBe(true)
    expect(t.ctrl.run(purifier, 'ON')).toBe(true)
    expect(Object.keys(t.pending).sort()).toEqual(['purifier-1', 'window-1'])
  })
})

describe('async server (202 + command.ack)', () => {
  it('succeeds on an EXECUTED ack and applies the device', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({ commandId: 'cmd-1', status: 'PENDING' })
    await flush()
    expect(t.pending['window-1']?.commandId).toBe('cmd-1')

    t.ctrl.handleAck(ack('EXECUTED', { device: opened() }))
    expect(t.applyDevice).toHaveBeenCalledWith(opened())
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: true })])
    expect(t.pending).toEqual({})
  })

  it('fails on a FAILED ack with the server reason', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({ commandId: 'cmd-1', status: 'PENDING' })
    await flush()
    t.ctrl.handleAck(ack('FAILED', { reason: '모터 과부하' }))
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: false, reason: '모터 과부하' })])
  })

  it('handles an ack that arrives before the HTTP response', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.ctrl.handleAck(ack('EXECUTED', { device: opened() })) // too early: id unknown yet
    expect(t.outcomes).toHaveLength(0)

    t.resolveSend({ commandId: 'cmd-1', status: 'PENDING' })
    await flush()
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: true })])
  })

  it('ignores an ack for another command id', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({ commandId: 'cmd-1', status: 'PENDING' })
    await flush()
    t.ctrl.handleAck(ack('FAILED', { commandId: 'cmd-other' }))
    expect(t.outcomes).toHaveLength(0)
    expect(t.pending['window-1']).toBeDefined()
  })

  it('verifies against the server when EXECUTED comes without a device', async () => {
    const t = setup({ refetch: async () => [opened()] })
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({ commandId: 'cmd-1', status: 'PENDING' })
    await flush()
    t.ctrl.handleAck(ack('EXECUTED'))
    await flush()
    expect(t.refetchDevices).toHaveBeenCalled()
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: true })])
  })

  it('reports failure when the server says EXECUTED but its list disagrees', async () => {
    const t = setup({ refetch: async () => [windowClosed] })
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({ commandId: 'cmd-1', status: 'PENDING' })
    await flush()
    t.ctrl.handleAck(ack('EXECUTED'))
    await flush()
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: false })])
  })
})

describe('sync server (final status in the response)', () => {
  it('succeeds on EXECUTED even if updatedAt was not bumped', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({
      commandId: 'cmd-1',
      status: 'EXECUTED',
      device: { ...windowClosed, state: 'OPEN' }, // same updatedAt as before
    })
    await flush()
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: true })])
  })

  it('fails on FAILED, with a default reason when none is given', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({ commandId: 'cmd-1', status: 'FAILED', reason: '  ' })
    await flush()
    expect(t.outcomes).toEqual([
      expect.objectContaining({ ok: false, reason: '기기가 명령을 수행하지 못했습니다.' }),
    ])
  })
})

describe('server that only pushes device.state (no ack)', () => {
  it('succeeds once the cache shows the target state with a newer timestamp', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({ commandId: 'cmd-1', status: 'PENDING' })
    await flush()
    t.pushDevices([opened()])
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: true })])
  })

  it('does not count a stale, out-of-order update as confirmation', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.pushDevices([opened(T0 - 120_000)]) // older than the state the command started from
    expect(t.outcomes).toHaveLength(0)
  })

  it('treats an empty 204 response as accepted and waits', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend(undefined)
    await flush()
    expect(t.outcomes).toHaveLength(0)
    t.pushDevices([opened()])
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: true })])
  })
})

describe('timeout', () => {
  it('succeeds if the device turns out to be in the target state', async () => {
    const t = setup({
      send: () => new Promise(() => {}),
      refetch: async () => [opened()],
    })
    t.ctrl.run(windowClosed, 'OPEN')
    vi.advanceTimersByTime(COMMAND_TIMEOUT_MS)
    await flush()
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: true })])
  })

  it('fails with a check-the-device message otherwise', async () => {
    const t = setup({ send: () => new Promise(() => {}) })
    t.ctrl.run(windowClosed, 'OPEN')
    vi.advanceTimersByTime(COMMAND_TIMEOUT_MS - 1)
    await flush()
    expect(t.outcomes).toHaveLength(0)
    vi.advanceTimersByTime(1)
    await flush()
    expect(t.outcomes).toEqual([
      expect.objectContaining({ ok: false, reason: '기기 응답이 없습니다. 실제 상태를 확인해 주세요.' }),
    ])
  })

  it('fails if the state check itself fails', async () => {
    const t = setup({
      send: () => new Promise(() => {}),
      refetch: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    t.ctrl.run(windowClosed, 'OPEN')
    vi.advanceTimersByTime(COMMAND_TIMEOUT_MS)
    await flush()
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: false })])
  })

  it('ignores a late ack after giving up (one outcome only)', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({ commandId: 'cmd-1', status: 'PENDING' })
    await flush()
    vi.advanceTimersByTime(COMMAND_TIMEOUT_MS)
    await flush()
    t.ctrl.handleAck(ack('EXECUTED', { device: opened() }))
    expect(t.outcomes).toHaveLength(1)
    expect(t.outcomes[0]?.ok).toBe(false)
    // ...but the late device data still reaches the cache
    expect(t.applyDevice).toHaveBeenCalledWith(opened())
  })

  it('stops the timer once resolved', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.resolveSend({ commandId: 'cmd-1', status: 'EXECUTED', device: opened() })
    await flush()
    vi.advanceTimersByTime(COMMAND_TIMEOUT_MS * 2)
    await flush()
    expect(t.outcomes).toHaveLength(1)
    expect(t.refetchDevices).not.toHaveBeenCalled()
  })
})

describe('request errors', () => {
  it.each([
    [new TypeError('Failed to fetch'), '서버에 연결할 수 없습니다. 기기 상태를 확인해 주세요.'],
    [new ApiError(503, { message: '라즈베리파이가 오프라인입니다' }), '라즈베리파이가 오프라인입니다'],
    [new ApiError(503, '<html>Bad Gateway</html>'), '기기와 연결되어 있지 않습니다.'],
    [new ApiError(409, undefined), '기기가 다른 명령을 처리하고 있습니다.'],
    [new ApiError(422, { message: '' }), '지원하지 않는 명령입니다.'],
    [new ApiError(500, undefined), '서버 오류로 명령을 보내지 못했습니다.'],
  ])('%s → %s', async (error, reason) => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.rejectSend(error)
    await flush()
    expect(t.outcomes).toEqual([expect.objectContaining({ ok: false, reason })])
    expect(t.pending).toEqual({})
  })

  it('never writes the target state to the cache on failure (nothing to roll back)', async () => {
    const t = setup()
    t.ctrl.run(windowClosed, 'OPEN')
    t.rejectSend(new ApiError(500, undefined))
    await flush()
    expect(t.applyDevice).not.toHaveBeenCalled()
  })
})

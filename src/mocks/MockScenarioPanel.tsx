import { FlaskConical, X } from 'lucide-react'
import { useState } from 'react'
import { useNow } from '@/lib/useNow'
import { setCommandMode, setDoorAutoCloseMs, state, type CommandMode } from './data'
import { toggleDevice } from './devices'
import { setEdgeOnline, simulateServerOutage } from './realtime'

const OUTAGE_MS = 8_000

const commandModes: { value: CommandMode; label: string }[] = [
  { value: 'normal', label: '정상 (202 → ack)' },
  { value: 'fail', label: '실패 응답' },
  { value: 'timeout', label: '응답 없음' },
  { value: 'sync', label: '동기 응답 (200)' },
]

/** Dev-only controls for exercising realtime, NFR-03 and command UI states against the mock backend. */
export default function MockScenarioPanel() {
  const [open, setOpen] = useState(false)
  // The mock state isn't React state and also changes on its own (commands, auto-close),
  // so re-render every second to keep labels current, and right after a panel action
  useNow()
  const [, setTick] = useState(0)
  const run = (fn: () => void) => () => {
    fn()
    setTick((t) => t + 1)
  }

  const windowDevice = state.devices.find((d) => d.type === 'WINDOW')
  const door = state.devices.find((d) => d.type === 'FRONT_DOOR')
  const button = 'w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-bg disabled:opacity-50'
  const fastDoor = state.doorAutoCloseMs < 60_000

  return (
    <div className="fixed right-4 bottom-20 z-20 md:bottom-4">
      {open ? (
        <div className="max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">목업 시나리오</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="text-muted hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-2">
            <button type="button" className={button} onClick={run(() => setEdgeOnline(!state.edge.online))}>
              {state.edge.online ? '기기 연결 끊기' : '기기 연결 복구'}
            </button>
            <button
              type="button"
              className={button}
              disabled={state.serverDown}
              onClick={run(() => simulateServerOutage(OUTAGE_MS))}
            >
              서버 장애 {OUTAGE_MS / 1000}초
            </button>
            <button type="button" className={button} onClick={run(() => toggleDevice('WINDOW'))}>
              창문 {windowDevice?.state === 'OPEN' ? '닫기' : '열기'} (수동)
            </button>
            <button type="button" className={button} onClick={run(() => toggleDevice('FRONT_DOOR'))}>
              현관문 {door?.state === 'OPEN' ? '닫기' : '열기'} (수동)
            </button>

            <label className="block pt-1 text-xs font-medium text-muted" htmlFor="mock-command-mode">
              기기 명령 응답
            </label>
            <select
              id="mock-command-mode"
              value={state.commandMode}
              onChange={(e) => run(() => setCommandMode(e.target.value as CommandMode))()}
              className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm"
            >
              {commandModes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={button}
              onClick={run(() => setDoorAutoCloseMs(fastDoor ? 10 * 60_000 : 30_000))}
            >
              현관문 자동 닫기: {fastDoor ? '30초' : '10분'} (다음 열림부터)
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex size-11 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-lg hover:text-fg"
          aria-label="목업 시나리오 열기"
        >
          <FlaskConical className="size-5" />
        </button>
      )}
    </div>
  )
}

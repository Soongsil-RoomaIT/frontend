import { FlaskConical, X } from 'lucide-react'
import { useState } from 'react'
import { state } from './data'
import { setEdgeOnline, simulateServerOutage, toggleDevice } from './realtime'

const OUTAGE_MS = 8_000

/** Dev-only controls for exercising realtime / NFR-03 UI states against the mock backend. */
export default function MockScenarioPanel() {
  const [open, setOpen] = useState(false)
  // The mock state isn't React state; bump to re-render button labels after an action
  const [, setTick] = useState(0)
  const run = (fn: () => void) => () => {
    fn()
    setTick((t) => t + 1)
  }

  const windowDevice = state.devices.find((d) => d.type === 'WINDOW')
  const door = state.devices.find((d) => d.type === 'FRONT_DOOR')
  const button = 'w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-bg disabled:opacity-50'

  return (
    <div className="fixed right-4 bottom-20 z-20 md:bottom-4">
      {open ? (
        <div className="w-64 rounded-xl border border-border bg-surface p-3 shadow-xl">
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
              창문 {windowDevice?.state === 'OPEN' ? '닫기' : '열기'}
            </button>
            <button type="button" className={button} onClick={run(() => toggleDevice('FRONT_DOOR'))}>
              현관문 {door?.state === 'OPEN' ? '닫기' : '열기'}
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

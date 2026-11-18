import { FlaskConical, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNow } from '@/lib/useNow'
import {
  cloud,
  proposeRecommendation,
  runPrediction,
  setAutomationShape,
  setOutdoorScenario,
  setPredictionScenario,
  setRecommendationMode,
  setTrackRead,
  type OutdoorScenario,
  type PredictionScenario,
} from './cloud'
import { setCommandMode, setDoorAutoCloseMs, setHumidityOffset, setSensorScenario, state, type CommandMode, type SensorScenario } from './data'
import { setOddDeviceState, toggleDevice } from './devices'
import { setEdgeOnline, simulateServerOutage } from './realtime'

const OUTAGE_MS = 8_000

const commandModes: { value: CommandMode; label: string }[] = [
  { value: 'normal', label: '정상 (202 → ack)' },
  { value: 'fail', label: '실패 응답' },
  { value: 'timeout', label: '응답 없음' },
  { value: 'sync', label: '동기 응답 (200)' },
]
const sensorScenarios: { value: SensorScenario; label: string }[] = [
  { value: 'v1.2', label: '온습도만 (v1.2)' },
  { value: 'full', label: '전체 센서' },
  { value: 'failing', label: '센서 오류 (값 없음)' },
]
const outdoorScenarios: { value: OutdoorScenario; label: string }[] = [
  { value: 'normal', label: '보통' },
  { value: 'dust', label: '미세먼지 나쁨 → 자동 실행' },
  { value: 'rain', label: '비 예보' },
  { value: 'partial', label: '미세먼지 정보 없음' },
  { value: 'stale', label: '오래된 정보' },
  { value: 'unavailable', label: '외기 정보 없음' },
]
const predictionScenarios: { value: PredictionScenario; label: string }[] = [
  { value: 'normal', label: '보통' },
  { value: 'high', label: '습도 상승 예측 → 제습기 선제' },
  { value: 'worse', label: '모델이 기준선보다 부정확' },
  { value: 'none', label: '모델 없음' },
]

const buttonClass = 'w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-bg disabled:opacity-50'

function PanelButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={buttonClass} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function Select<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <>
      <label className="block pt-1 text-xs font-medium text-muted" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  )
}

/** Dev-only controls for exercising realtime, NFR-03, commands and the v1.2 cloud features against the mock. */
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
  const fastDoor = state.doorAutoCloseMs < 60_000
  // Every button re-renders the panel after its action (see `run`)
  const Btn = PanelButton

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
            <Btn onClick={run(() => setEdgeOnline(!state.edge.online))}>{state.edge.online ? '기기 연결 끊기' : '기기 연결 복구'}</Btn>
            <Btn disabled={state.serverDown} onClick={run(() => simulateServerOutage(OUTAGE_MS))}>
              서버 장애 {OUTAGE_MS / 1000}초
            </Btn>
            <Btn onClick={run(() => toggleDevice('WINDOW'))}>창문 {windowDevice?.state === 'OPEN' ? '닫기' : '열기'} (수동)</Btn>
            <Btn onClick={run(() => toggleDevice('FRONT_DOOR'))}>현관문 {door?.state === 'OPEN' ? '닫기' : '열기'} (수동)</Btn>
            <Btn onClick={run(() => setOddDeviceState('WINDOW', 'FAULT'))}>창문 상태 FAULT 보고</Btn>

            <Select id="mock-command-mode" label="기기 명령 응답" value={state.commandMode} options={commandModes} onChange={(v) => run(() => setCommandMode(v))()} />
            <Btn onClick={run(() => setDoorAutoCloseMs(fastDoor ? 10 * 60_000 : 30_000))}>
              현관문 자동 닫기: {fastDoor ? '30초' : '10분'} (다음 열림부터)
            </Btn>

            <Select id="mock-sensors" label="센서 구성 (다음 측정부터)" value={state.sensorScenario} options={sensorScenarios} onChange={(v) => run(() => setSensorScenario(v))()} />
            <Btn onClick={run(() => setHumidityOffset(state.humidityOffset > 0 ? 0 : 20))}>
              실내 습도 {state.humidityOffset > 0 ? '원래대로' : '+20% (규칙 발동)'}
            </Btn>

            <Select id="mock-outdoor" label="외기 응답" value={cloud.outdoorScenario} options={outdoorScenarios} onChange={(v) => run(() => setOutdoorScenario(v))()} />
            <Select id="mock-prediction" label="AI 예측 응답" value={cloud.predictionScenario} options={predictionScenarios} onChange={(v) => run(() => setPredictionScenario(v))()} />
            <Btn onClick={run(runPrediction)}>예측 1회 실행 (forecast.update)</Btn>

            <p className="pt-1 text-xs font-medium text-muted">기준값 추천</p>
            <Btn onClick={run(proposeRecommendation)}>새 추천 만들기</Btn>
            <Btn onClick={run(() => setRecommendationMode(cloud.recommendationMode === 'ready' ? 'collecting' : 'ready'))}>
              {cloud.recommendationMode === 'ready' ? '데이터 수집 중 (4/10)으로' : '추천 가능 상태로'}
            </Btn>

            <p className="pt-1 text-xs font-medium text-muted">서버 형식</p>
            <Btn onClick={run(() => setAutomationShape(cloud.automationShape === 'rules' ? 'flat' : 'rules'))}>
              자동제어 응답: {cloud.automationShape === 'rules' ? '규칙 목록' : '평면 객체'}
            </Btn>
            <Btn onClick={run(() => setTrackRead(!cloud.trackRead))}>알림 읽음 추적: {cloud.trackRead ? '서버' : '없음 (로컬)'}</Btn>
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

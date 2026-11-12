import { ArrowDownRight, ArrowRight, ArrowUpRight, BrainCircuit, RefreshCw } from 'lucide-react'
import type { KnownPredictionMetric, PredictionMetric } from '@/api/types'
import { LevelBadge } from '@/features/monitoring/LevelBadge'
import { useLatestSensors } from '@/features/monitoring/queries'
import { useMetrics } from '@/features/monitoring/useMetrics'
import { formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { controlActive, hasPrediction, modelBeatsBaseline, modelQuality } from './prediction'
import { usePrediction } from './queries'

const metricNames: Record<KnownPredictionMetric, { label: string; unit: string; digits: number }> = {
  humidity: { label: '습도', unit: '%', digits: 0 },
  temperature: { label: '온도', unit: '°C', digits: 1 },
}
const isKnownMetric = (m: string): m is KnownPredictionMetric => Object.hasOwn(metricNames, m)

const fmt = (v: number | null, digits: number) => (v === null ? '—' : v.toFixed(digits))

function MetricRow({ m, current }: { m: PredictionMetric; current: number | null }) {
  const { metricByKey } = useMetrics()
  const known = isKnownMetric(m.metric) ? m.metric : null
  const meta = known ? metricNames[known] : { label: m.metric, unit: '', digits: 1 }
  const delta = m.predicted !== null && current !== null ? m.predicted - current : null
  const Trend = delta === null || Math.abs(delta) < 0.05 ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight
  const better = modelBeatsBaseline(m)
  // The same grade the dashboard gives today's reading, for the predicted one
  const grade = known && m.predicted !== null ? metricByKey[known].assess(m.predicted) : null

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted">1시간 뒤 {meta.label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-semibold tabular-nums">
          {fmt(m.predicted, meta.digits)}
          <span className="ml-1 text-sm font-normal text-muted">{meta.unit}</span>
        </span>
        {current !== null && (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted tabular-nums">
            <Trend className="size-3.5" aria-hidden />
            지금 {fmt(current, meta.digits)}
            {meta.unit}
          </span>
        )}
      </div>
      {grade && (
        <div className="mt-1.5">
          <LevelBadge assessment={grade} />
        </div>
      )}
      <dl className="mt-3 space-y-0.5 text-xs text-muted">
        <div className="flex justify-between gap-2">
          <dt>기준선 (지금과 같음)</dt>
          <dd className="tabular-nums">{fmt(m.baseline, meta.digits)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>최근 24시간 오차 · 모델 / 기준선</dt>
          <dd className="tabular-nums">
            {fmt(m.mae, 1)} / {fmt(m.baselineMae, 1)}
          </dd>
        </div>
        {m.actual !== null && (
          <div className="flex justify-between gap-2">
            <dt>실제값</dt>
            <dd className="tabular-nums">{fmt(m.actual, meta.digits)}</dd>
          </div>
        )}
      </dl>
      {better !== null && (
        <p className={`mt-2 text-xs font-medium ${better ? 'text-status-good' : 'text-status-serious'}`}>
          {better ? '모델이 기준선보다 정확합니다' : '모델이 기준선보다 부정확합니다'}
        </p>
      )}
    </div>
  )
}

/** AI prediction of indoor humidity/temperature an hour ahead, with its accuracy against the baseline */
export function PredictionCard() {
  const { data, isPending, isError, refetch, isFetching } = usePrediction()
  const { data: latest } = useLatestSensors()
  const now = useNow()

  return (
    <section aria-labelledby="prediction-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="prediction-heading" className="inline-flex items-center gap-1.5 text-base font-semibold">
          <BrainCircuit className="size-4 text-muted" aria-hidden />
          AI 실내 환경 예측
        </h2>
        {data?.generatedAt && (
          <p className="text-xs text-muted">
            {formatRelative(Date.parse(data.generatedAt), now)} 계산
            {data.modelVersion && ` · 모델 ${data.modelVersion}`}
          </p>
        )}
      </div>

      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : isError && !data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <span>예측을 불러오지 못했습니다.</span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-bg disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            다시 시도
          </button>
        </div>
      ) : !data || !hasPrediction(data) ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
          {data?.message ?? '아직 예측 모델이 준비되지 않았습니다. 측정 데이터가 쌓이면 학습 후 표시됩니다.'}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {data.metrics.map((m) => (
              <MetricRow
                key={m.metric}
                m={m}
                current={latest && isKnownMetric(m.metric) ? latest[m.metric] : null}
              />
            ))}
          </div>
          <ControlNote active={controlActive(data)} quality={modelQuality(data)} message={data.message} />
        </div>
      )}
    </section>
  )
}

function ControlNote({ active, quality, message }: { active: boolean | null; quality: ReturnType<typeof modelQuality>; message: string | null }) {
  const text =
    active === true
      ? '예측 습도가 기준을 넘으면 제습기를 미리 켭니다. 창문은 예측으로 움직이지 않습니다.'
      : active === false
        ? quality === 'worse'
          ? '모델이 기준선보다 부정확해 예측 기반 제어는 꺼져 있습니다. 규칙 기반 자동제어는 계속 동작합니다.'
          : '예측 기반 제어가 꺼져 있습니다. 규칙 기반 자동제어는 계속 동작합니다.'
        : '예측 기반 제어 사용 여부를 아직 알 수 없습니다.'
  return (
    <div className="rounded-lg bg-surface px-3 py-2 text-sm">
      <span className="font-medium">예측 기반 제습기 선제 가동: </span>
      <span className={active === true ? 'text-status-good' : 'text-muted'}>{active === true ? '사용 중' : active === false ? '꺼짐' : '알 수 없음'}</span>
      <p className="mt-0.5 text-xs text-muted">{text}</p>
      {message && <p className="mt-1 text-xs text-muted">{message}</p>}
    </div>
  )
}

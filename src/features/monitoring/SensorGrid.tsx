import { Clock, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { LevelBadge } from './LevelBadge'
import { assessGas, STALE_AFTER_MS } from './metrics'
import { useLatestSensors } from './queries'
import { useSystemStatus } from './systemStatus'
import { useMetrics } from './useMetrics'

interface Card {
  key: string
  label: string
  /** undefined = not loaded yet, null = not measured (no sensor, ADR-008) */
  value: number | boolean | null | undefined
  /** What null means for this card, when it isn't simply "no sensor" */
  missingLabel?: string
  /** Extra grid classes for the card */
  className?: string
  render: (value: number | boolean) => ReactNode
}

function SensorCard({
  label,
  loading,
  missing,
  missingLabel = '센서 없음',
  dimmed,
  className = '',
  children,
}: {
  label: string
  loading: boolean
  missing: boolean
  missingLabel?: string
  dimmed: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-4 transition-opacity ${dimmed || missing ? 'opacity-60' : ''} ${className}`}
      aria-label={`${label} ${missing ? missingLabel : ''}`.trim()}
    >
      <div className="text-xs text-muted">{label}</div>
      {loading ? (
        <>
          <div className="mt-2 h-8 w-20 animate-pulse rounded bg-border" />
          <div className="mt-2 h-4 w-12 animate-pulse rounded bg-border" />
        </>
      ) : missing ? (
        // Shown plainly rather than as 0 or a grade
        <>
          <div className="mt-1.5 text-2xl font-semibold text-muted">—</div>
          <div className="mt-1.5 text-xs text-muted" title="이 항목은 측정하지 않거나 값을 받지 못했습니다">
            {missingLabel}
          </div>
        </>
      ) : (
        children
      )}
    </div>
  )
}

export function SensorGrid() {
  const { data, isPending, isError, refetch, isFetching } = useLatestSensors()
  const status = useSystemStatus()
  const now = useNow()
  const { metrics } = useMetrics()

  if (isError && !data) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
        <span>센서 데이터를 불러오지 못했습니다.</span>
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
    )
  }

  const measuredMs = data ? Date.parse(data.measuredAt) : null
  // Values are only "live" when the edge is connected and recent; otherwise they're the last known readings
  const disconnected = status.kind === 'edge-offline' || status.kind === 'server-disconnected'
  const stale = measuredMs !== null && (disconnected || now - measuredMs > STALE_AFTER_MS)
  const staleLabel = disconnected ? '실시간 업데이트 중단' : '업데이트 지연'

  // Temperature and humidity, then the gas flag (indoor CO₂ and dust are not shown, HIDDEN_METRICS)
  const numeric: Card[] = metrics.map((m) => ({
    key: m.key,
    label: m.label,
    value: data ? data[m.key] : undefined,
    render: (value) => (
      <>
        <div className="mt-1.5 text-2xl font-semibold">
          {m.format(value as number)}
          <span className="ml-1 text-sm font-normal text-muted">{m.unit}</span>
        </div>
        <div className="mt-1.5">
          <LevelBadge assessment={m.assess(value as number)} />
        </div>
      </>
    ),
  }))
  const gas: Card = {
    key: 'gasDetected',
    label: '유해가스',
    value: data ? data.gasDetected : undefined,
    // SAD v1.4 ADR-020: null while the MQ-2 warms up or fails, not only when there is no sensor
    missingLabel: '감지 정보 없음',
    // Third card in a two-column phone grid: take the full row instead of leaving a gap
    className: 'col-span-2 sm:col-span-1',
    render: (detected) => (
      <>
        <div className={`mt-1.5 text-2xl font-semibold ${detected ? 'text-status-critical' : ''}`}>{detected ? '감지됨' : '감지 안 됨'}</div>
        <div className="mt-1.5">
          <LevelBadge assessment={assessGas(detected as boolean)} />
        </div>
      </>
    ),
  }
  const humidityAt = numeric.findIndex((c) => c.key === 'humidity')
  const gasAt = humidityAt === -1 ? numeric.length : humidityAt + 1
  const cards = [...numeric.slice(0, gasAt), gas, ...numeric.slice(gasAt)]

  return (
    <section aria-labelledby="sensor-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sensor-heading" className="text-base font-semibold">
          실내 환경
        </h2>
        {measuredMs !== null && (
          <p className={`inline-flex items-center gap-1 text-xs ${stale ? 'font-medium text-fg' : 'text-muted'}`}>
            {stale && <Clock className="size-3.5 text-status-warning" aria-hidden />}
            {stale && `${staleLabel} · `}
            <time dateTime={data?.measuredAt} title={new Date(measuredMs).toLocaleString('ko-KR')}>
              {formatRelative(measuredMs, now)} 측정
            </time>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <SensorCard
            key={card.key}
            label={card.label}
            loading={isPending || card.value === undefined}
            missing={card.value === null}
            missingLabel={card.missingLabel}
            className={card.className}
            dimmed={stale}
          >
            {card.value !== undefined && card.value !== null && card.render(card.value)}
          </SensorCard>
        ))}
      </div>
    </section>
  )
}

import { Clock, RefreshCw } from 'lucide-react'
import { formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { LevelBadge } from './LevelBadge'
import { metrics, STALE_AFTER_MS } from './metrics'
import { useLatestSensors } from './queries'
import { useSystemStatus } from './systemStatus'

export function SensorGrid() {
  const { data, isPending, isError, refetch, isFetching } = useLatestSensors()
  const status = useSystemStatus()
  const now = useNow()

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((m) => {
          const value = data?.[m.key]
          return (
            <div
              key={m.key}
              className={`rounded-xl border border-border bg-surface p-4 transition-opacity ${stale ? 'opacity-60' : ''}`}
            >
              <div className="text-xs text-muted">{m.label}</div>
              {isPending || value === undefined ? (
                <>
                  <div className="mt-2 h-8 w-20 animate-pulse rounded bg-border" />
                  <div className="mt-2 h-4 w-12 animate-pulse rounded bg-border" />
                </>
              ) : (
                <>
                  <div className="mt-1.5 text-2xl font-semibold">
                    {m.format(value)}
                    <span className="ml-1 text-sm font-normal text-muted">{m.unit}</span>
                  </div>
                  <div className="mt-1.5">
                    <LevelBadge assessment={m.assess(value)} />
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

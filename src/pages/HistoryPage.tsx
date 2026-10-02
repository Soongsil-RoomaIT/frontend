import { RefreshCw, Table2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import type { HistoryRange, SensorMetric } from '@/api/types'
import { PageHeader } from '@/components/PageHeader'
import { SegmentedControl } from '@/components/SegmentedControl'
import { HistoryChart, type ChartPoint } from '@/features/monitoring/HistoryChart'
import { formatPointTime, rangeOptions } from '@/features/monitoring/historyFormat'
import { metricByKey, metrics, type MetricMeta } from '@/features/monitoring/metrics'
import { useSensorHistory } from '@/features/monitoring/queries'

const formatBucket = (sec: number) =>
  sec >= 3600 && sec % 3600 === 0 ? `${sec / 3600}시간` : sec >= 60 && sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`

const metricOptions = metrics.map((m) => ({ value: m.key, label: m.label }))
const isRange = (v: string | null): v is HistoryRange => rangeOptions.some((o) => o.value === v)
const isMetric = (v: string | null): v is SensorMetric => v !== null && Object.hasOwn(metricByKey, v)

function Stat({ label, value, metric }: { label: string; value: number; metric: MetricMeta }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">
        {metric.format(value)}
        <span className="ml-0.5 text-xs font-normal text-muted">{metric.unit}</span>
      </div>
    </div>
  )
}

export function HistoryPage() {
  // Filters live in the URL so a view can be shared or bookmarked
  const [params, setParams] = useSearchParams()
  const rangeParam = params.get('range')
  const metricParam = params.get('metric')
  const range: HistoryRange = isRange(rangeParam) ? rangeParam : '24h'
  const metricKey: SensorMetric = isMetric(metricParam) ? metricParam : 'co2'
  const showTable = params.get('view') === 'table'
  const metric = metricByKey[metricKey]

  // setParams' functional form receives the params of the last *render*, so two changes before a
  // re-render (e.g. quick clicks) would drop the first. Track the not-yet-rendered value ourselves.
  const pendingParams = useRef<URLSearchParams | null>(null)
  useEffect(() => {
    pendingParams.current = null
  }, [params])

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(pendingParams.current ?? params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    pendingParams.current = next
    setParams(next, { replace: true })
  }

  const { data, isPending, isError, isFetching, isPlaceholderData, refetch } = useSensorHistory(range)

  const points: ChartPoint[] = useMemo(
    () => (data?.points ?? []).map((p) => ({ t: Date.parse(p.measuredAt), v: p[metricKey] })),
    [data, metricKey],
  )

  const stats = useMemo(() => {
    if (points.length === 0) return null
    let min = Infinity
    let max = -Infinity
    let sum = 0
    for (const { v } of points) {
      min = Math.min(min, v)
      max = Math.max(max, v)
      sum += v
    }
    return { min, max, avg: sum / points.length }
  }, [points])

  const rangeLabel = rangeOptions.find((o) => o.value === range)?.label

  return (
    <>
      <PageHeader title="기록" description="센서 측정 추이를 확인합니다." />

      {/* One filter row scoping everything below it */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl label="기간" options={rangeOptions} value={range} onChange={(v) => update('range', v)} />
        <SegmentedControl label="측정 항목" options={metricOptions} value={metricKey} onChange={(v) => update('metric', v)} />
        <button
          type="button"
          aria-pressed={showTable}
          onClick={() => update('view', showTable ? null : 'table')}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium ${
            showTable ? 'bg-primary-soft text-primary' : 'bg-surface text-muted hover:text-fg'
          }`}
        >
          <Table2 className="size-4" aria-hidden />
          표로 보기
        </button>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 md:p-5" aria-labelledby="history-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="history-title" className="font-semibold">
              {metric.label} <span className="font-normal text-muted">({metric.unit})</span>
            </h2>
            <p className="text-xs text-muted">
              최근 {rangeLabel}
              {data && data.range === range && ` · ${formatBucket(data.bucketSeconds)} 평균`}
              {isFetching && !isPending && ' · 불러오는 중…'}
            </p>
            {metric.guideline && !showTable && (
              // Key for the reference line, kept outside the plot so it never collides with the data
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                <span className="h-px w-4 bg-status-warning" aria-hidden />
                {metric.guideline.label}
              </p>
            )}
          </div>
          {stats && !isPlaceholderData && (
            <div className="flex gap-6">
              <Stat label="최저" value={stats.min} metric={metric} />
              <Stat label="평균" value={stats.avg} metric={metric} />
              <Stat label="최고" value={stats.max} metric={metric} />
            </div>
          )}
        </div>

        {isPending ? (
          <div className="h-[280px] animate-pulse rounded-lg bg-bg" />
        ) : isError && !data ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-3 text-sm text-muted">
            기록을 불러오지 못했습니다.
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-fg hover:bg-bg"
            >
              <RefreshCw className="size-4" aria-hidden />
              다시 시도
            </button>
          </div>
        ) : points.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted">이 기간의 기록이 없습니다.</div>
        ) : (
          // Refetch keeps the previous frame, dimmed, instead of flashing a skeleton
          <div className={`transition-opacity ${isPlaceholderData ? 'opacity-50' : ''}`}>
            {showTable ? (
              <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    {metric.label} 측정 기록, 최근 {rangeLabel}
                  </caption>
                  <thead className="sticky top-0 bg-surface text-xs text-muted">
                    <tr className="border-b border-border">
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        시간
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {metric.label} ({metric.unit})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {[...points].reverse().map((p) => (
                      <tr key={p.t} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5">{formatPointTime(range, p.t)}</td>
                        <td className="px-3 py-1.5 text-right">{metric.format(p.v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <HistoryChart points={points} metric={metric} range={range} />
            )}
          </div>
        )}
      </section>
    </>
  )
}

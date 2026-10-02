import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { HistoryRange } from '@/api/types'
import { yScale } from './chartScale'
import { alignedTicks, formatPointTime, formatTick } from './historyFormat'
import type { MetricMeta } from './metrics'

export interface ChartPoint {
  t: number
  v: number
}

interface HistoryChartProps {
  points: ChartPoint[]
  metric: MetricMeta
  range: HistoryRange
}

const CHART_HEIGHT = 280

const axisTick = { fill: 'var(--color-muted)', fontSize: 12 }

function ChartTooltip({
  active,
  payload,
  metric,
  range,
}: TooltipContentProps & { metric: MetricMeta; range: HistoryRange }) {
  const point = payload?.[0]?.payload as ChartPoint | undefined
  if (!active || !point) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-lg">
      <div className="text-xs text-muted">{formatPointTime(range, point.t)}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-0.5 w-3 rounded bg-series-1" aria-hidden />
        <span className="font-semibold text-fg">
          {metric.format(point.v)} {metric.unit}
        </span>
        <span className="text-xs text-muted">{metric.label}</span>
      </div>
    </div>
  )
}

/** Single-series trend for one metric. One series → no legend; the card title names it. */
export function HistoryChart({ points, metric, range }: HistoryChartProps) {
  const first = points[0]?.t ?? 0
  const last = points.at(-1)?.t ?? 0
  const y = yScale(points, metric)
  const yFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: y.step < 1 ? 1 : 0 })
  return (
    <AreaChart
      responsive
      data={points}
      style={{ width: '100%', height: CHART_HEIGHT }}
      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      accessibilityLayer
    >
      <CartesianGrid vertical={false} stroke="var(--color-border)" />
      <XAxis
        dataKey="t"
        type="number"
        scale="time"
        domain={['dataMin', 'dataMax']}
        ticks={alignedTicks(range, first, last)}
        tickFormatter={(t: number) => formatTick(range, t)}
        tick={axisTick}
        tickLine={false}
        axisLine={{ stroke: 'var(--color-border)' }}
        minTickGap={32}
      />
      <YAxis
        dataKey="v"
        type="number"
        domain={y.domain}
        ticks={y.ticks}
        tickFormatter={(v: number) => yFmt.format(v)}
        tick={axisTick}
        tickLine={false}
        axisLine={false}
        width={44}
      />
      {metric.guideline && (
        <ReferenceLine
          y={metric.guideline.value}
          stroke="var(--color-status-warning)"
          strokeWidth={1}
        />
      )}
      <Tooltip
        content={(props) => <ChartTooltip {...props} metric={metric} range={range} />}
        cursor={{ stroke: 'var(--color-muted)', strokeWidth: 1 }}
        isAnimationActive={false}
      />
      <Area
        type="monotone"
        dataKey="v"
        name={metric.label}
        stroke="var(--color-series-1)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="var(--color-series-1)"
        fillOpacity={0.1}
        dot={false}
        activeDot={{ r: 4, fill: 'var(--color-series-1)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
        isAnimationActive={false}
      />
    </AreaChart>
  )
}

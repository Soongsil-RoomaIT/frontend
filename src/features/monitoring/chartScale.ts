import type { ChartPoint } from './HistoryChart'
import type { MetricMeta } from './metrics'

/** Rounds a raw step up to 1, 2, 2.5 or 5 × 10ⁿ so ticks land on clean numbers. */
function niceStep(raw: number) {
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const n = raw / magnitude
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * magnitude
}

/**
 * Y scale: data extent, widened to the metric's minimum span, always including the guideline
 * (so its line is never silently clipped), never below zero except for temperature,
 * then snapped outward to clean tick values.
 */
export function yScale(points: ChartPoint[], metric: MetricMeta, tickCount = 4) {
  let lo = Infinity
  let hi = -Infinity
  for (const { v } of points) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  if (metric.guideline) hi = Math.max(hi, metric.guideline.value)
  const missing = metric.minChartSpan - (hi - lo)
  if (missing > 0) {
    lo -= missing / 2
    hi += missing / 2
  }
  if (metric.key !== 'temperature' && lo < 0) {
    hi -= lo
    lo = 0
  }

  const step = niceStep((hi - lo) / tickCount)
  const min = Math.floor(lo / step) * step
  const max = Math.ceil(hi / step) * step
  const ticks: number[] = []
  // Index-based to avoid floating-point drift accumulating across steps (e.g. 2.5)
  for (let i = 0; min + i * step <= max + step / 1e6; i++) ticks.push(Number((min + i * step).toPrecision(12)))
  return { domain: [min, max] as [number, number], ticks, step }
}

import { describe, expect, it } from 'vitest'
import { summarize, yScale } from './chartScale'
import type { MetricMeta } from './metrics'

const meta = (key: MetricMeta['key'], minChartSpan: number, guideline?: number) =>
  ({ key, minChartSpan, guideline: guideline === undefined ? undefined : { value: guideline, label: '' } }) as MetricMeta
const pts = (...vs: (number | null)[]) => vs.map((v, t) => ({ t, v }))

describe('yScale', () => {
  it.each([
    ['flat temperature widened to min span', pts(25.4, 25.8), meta('temperature', 4)],
    ['pm25 with guideline', pts(4, 34), meta('pm25', 20, 35)],
    ['humidity', pts(45, 66), meta('humidity', 20, 60)],
    ['co2', pts(548, 1264), meta('co2', 400, 1000)],
    ['pm near zero', pts(1, 3), meta('pm10', 30, 80)],
    ['single point', pts(12), meta('pm25', 20, 35)],
    ['negative temperature', pts(-3.2, 1.1), meta('temperature', 4)],
    ['gaps in the data', pts(45, null, 66, null), meta('humidity', 20, 60)],
    ['nothing measured', pts(null, null), meta('humidity', 20, 60)],
  ])('%s', (_name, points, m) => {
    const { domain, ticks, step } = yScale(points, m)
    const values = points.map((p) => p.v).filter((v): v is number => v !== null).concat(m.guideline ? [m.guideline.value] : [])
    // covers all data and the guideline
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(domain[0])
      expect(v).toBeLessThanOrEqual(domain[1])
    }
    // evenly spaced clean ticks
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(ticks.length).toBeLessThanOrEqual(7)
    ticks.slice(1).forEach((tick, i) => expect(tick - ticks[i]!).toBeCloseTo(step))
    // never below zero except temperature
    if (m.key !== 'temperature') expect(domain[0]).toBeGreaterThanOrEqual(0)
    // respects the minimum span
    expect(domain[1] - domain[0]).toBeGreaterThanOrEqual(m.minChartSpan)
    expect(Number.isFinite(domain[0]) && Number.isFinite(domain[1])).toBe(true)
  })
})

describe('yScale with gaps', () => {
  it('ignores gaps instead of treating them as 0', () => {
    const { domain } = yScale(pts(45, null, 66, null), meta('humidity', 20, 60))
    expect(domain[0]).toBeGreaterThanOrEqual(40)
  })
})

describe('summarize', () => {
  it('skips gaps and reports how many points counted', () => {
    expect(summarize(pts(10, null, 20))).toEqual({ min: 10, max: 20, avg: 15, count: 2 })
  })
  it('is null when nothing was measured', () => {
    expect(summarize(pts(null, null))).toBeNull()
    expect(summarize([])).toBeNull()
  })
})

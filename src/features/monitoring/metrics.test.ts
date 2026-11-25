import { describe, expect, it } from 'vitest'
import { assessGas, isVisibleMetric, metricByKey, visibleMetrics } from './metrics'

describe('hidden metrics', () => {
  it('keeps CO₂ out of what the user sees, in the order of the dashboard', () => {
    expect(visibleMetrics.map((m) => m.key)).toEqual(['temperature', 'humidity', 'pm25', 'pm10'])
    expect(isVisibleMetric('co2')).toBe(false)
  })

  it('still knows CO₂, so it can come back by editing one set', () => {
    expect(metricByKey.co2.assess(1200).label).toBe('환기 필요')
  })
})

describe('assessGas', () => {
  it('grades the MQ-2 flag', () => {
    expect(assessGas(true)).toEqual({ level: 'critical', label: '환기 필요' })
    expect(assessGas(false)).toEqual({ level: 'good', label: '정상' })
  })
})

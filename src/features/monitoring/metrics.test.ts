import { describe, expect, it } from 'vitest'
import { assessGas, isVisibleMetric, metricByKey, visibleMetrics } from './metrics'

describe('hidden metrics', () => {
  it('shows only the indoor metrics the room measures (no CO₂, no indoor dust)', () => {
    expect(visibleMetrics.map((m) => m.key)).toEqual(['temperature', 'humidity'])
    expect(['co2', 'pm25', 'pm10'].some(isVisibleMetric)).toBe(false)
  })

  it('still knows them: outdoor dust grades use them, and they can come back by editing one set', () => {
    expect(metricByKey.co2.assess(1200).label).toBe('환기 필요')
    expect(metricByKey.pm25.assess(40).label).toBe('나쁨')
    expect(metricByKey.pm10.assess(20).label).toBe('좋음')
  })
})

describe('assessGas', () => {
  it('grades the MQ-2 flag', () => {
    expect(assessGas(true)).toEqual({ level: 'critical', label: '환기 필요' })
    expect(assessGas(false)).toEqual({ level: 'good', label: '정상' })
  })
})

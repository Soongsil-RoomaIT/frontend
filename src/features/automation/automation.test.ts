import { describe, expect, it } from 'vitest'
import { createMetrics, indexMetrics } from '@/features/monitoring/metrics'
import { comfortErrors, DEFAULT_COMFORT, loadComfort } from '@/stores/comfort'
import { validateThresholds, visibleThresholds } from './thresholds'

describe('validateThresholds', () => {
  it('parses valid input', () => {
    const { values, errors } = validateThresholds({ humidityOn: '65', humidityOff: '55', rainProbability: '0' })
    expect(errors).toEqual({})
    expect(values).toEqual({ humidityOn: 65, humidityOff: 55, rainProbability: 0 })
  })

  it.each([
    ['empty', ''],
    ['blank', '  '],
    ['text', 'abc'],
    ['too low', '10'],
    ['too high', '96'],
    ['infinite', 'Infinity'],
  ])('rejects %s', (_name, input) => {
    expect(validateThresholds({ humidityOn: input }).errors.humidityOn).toBeTruthy()
  })

  it.each([
    ['equal', '60', '60'],
    ['inverted', '60', '70'],
  ])('rejects an %s humidity pair', (_name, on, off) => {
    expect(validateThresholds({ humidityOn: on, humidityOff: off }).errors.humidityOff).toContain('낮아야')
  })

  it('does not compare the pair when one side is missing', () => {
    expect(validateThresholds({ humidityOff: '60' }).errors).toEqual({})
  })

  it('accepts the boundaries', () => {
    expect(validateThresholds({ co2Open: '400', pm25On: '500' }).errors).toEqual({})
  })
})

describe('visibleThresholds', () => {
  it('offers only what the server returned as numbers', () => {
    const keys = visibleThresholds({ enabled: true, mode: 'AUTO', humidityOn: 60, co2Open: '1000' as unknown as number })
    expect(keys.map((f) => f.key)).toEqual(['humidityOn'])
  })
})

describe('comfort range', () => {
  it('flags inverted and out-of-range values', () => {
    expect(comfortErrors(DEFAULT_COMFORT)).toEqual({})
    expect(comfortErrors({ ...DEFAULT_COMFORT, temperatureMin: 30 }).temperature).toBeTruthy()
    expect(comfortErrors({ ...DEFAULT_COMFORT, humidityMax: 101 }).humidity).toBeTruthy()
    expect(comfortErrors({ ...DEFAULT_COMFORT, humidityMin: NaN }).humidity).toBeTruthy()
  })

  it.each([
    ['nothing stored', () => null],
    ['broken JSON', () => '{oops'],
    ['invalid values', () => JSON.stringify({ temperatureMin: 90 })],
    ['wrong type', () => JSON.stringify({ humidityMin: 'dry' })],
    ['blocked storage', () => {
      throw new Error('denied')
    }],
  ])('falls back to defaults on %s', (_name, read) => {
    expect(loadComfort(read)).toEqual(DEFAULT_COMFORT)
  })

  it('loads what was saved, filling gaps from defaults', () => {
    expect(loadComfort(() => JSON.stringify({ temperatureMax: 24 }))).toEqual({ ...DEFAULT_COMFORT, temperatureMax: 24 })
  })
})

describe('metrics with a comfort range', () => {
  it('matches the original fixed grades by default', () => {
    const { temperature, humidity } = indexMetrics(createMetrics())
    expect(temperature.assess(14.9).label).toBe('추움')
    expect(temperature.assess(17.9).label).toBe('서늘함')
    expect(temperature.assess(18).label).toBe('적정')
    expect(temperature.assess(26).label).toBe('적정')
    expect(temperature.assess(28).label).toBe('더움')
    expect(temperature.assess(28.1).label).toBe('매우 더움')
    expect(humidity.assess(29).label).toBe('매우 건조')
    expect(humidity.assess(39).label).toBe('건조')
    expect(humidity.assess(60).label).toBe('적정')
    expect(humidity.assess(70).label).toBe('다소 습함')
    expect(humidity.assess(71).label).toBe('곰팡이 주의')
    expect(humidity.guideline?.value).toBe(60)
  })

  it('follows a custom range, including the chart guideline', () => {
    const { temperature, humidity } = indexMetrics(
      createMetrics({ temperatureMin: 20, temperatureMax: 24, humidityMin: 30, humidityMax: 50 }),
    )
    expect(temperature.assess(19).label).toBe('서늘함')
    expect(temperature.assess(25).label).toBe('더움')
    expect(humidity.assess(55).label).toBe('다소 습함')
    expect(humidity.guideline).toEqual({ value: 50, label: '적정 상한 50%' })
  })
})

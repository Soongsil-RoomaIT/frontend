import type { SensorMetric } from '@/api/types'
import { DEFAULT_COMFORT, type ComfortRange } from '@/stores/comfort'

export type Level = 'good' | 'warning' | 'serious' | 'critical'

export interface Assessment {
  level: Level
  label: string
}

export interface MetricMeta {
  key: SensorMetric
  label: string
  unit: string
  format: (value: number) => string
  assess: (value: number) => Assessment
  /** Upper bound of the recommended range, drawn as a reference line on charts */
  guideline?: { value: number; label: string }
  /**
   * Smallest y-axis span on charts. Without it a flat signal gets auto-zoomed until
   * sensor quantization (e.g. 0.1°C steps) looks like dramatic swings.
   */
  minChartSpan: number
}

const intFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })
const oneDecimal = (v: number) => v.toFixed(1)
const integer = (v: number) => intFmt.format(Math.round(v))

// Fine dust bands follow the Korean Ministry of Environment forecast grades (좋음/보통/나쁨/매우 나쁨).
const dustGrade = (v: number, [good, moderate, bad]: [number, number, number]): Assessment => {
  if (v <= good) return { level: 'good', label: '좋음' }
  if (v <= moderate) return { level: 'warning', label: '보통' }
  if (v <= bad) return { level: 'serious', label: '나쁨' }
  return { level: 'critical', label: '매우 나쁨' }
}

/** Temperature and humidity grades follow the user's comfort range (settings screen); the rest are fixed standards. */
export const createMetrics = (comfort: ComfortRange = DEFAULT_COMFORT): MetricMeta[] => [
  {
    key: 'temperature',
    label: '온도',
    unit: '°C',
    format: oneDecimal,
    minChartSpan: 4,
    assess: (v) => {
      if (v < comfort.temperatureMin - 3) return { level: 'serious', label: '추움' }
      if (v < comfort.temperatureMin) return { level: 'warning', label: '서늘함' }
      if (v <= comfort.temperatureMax) return { level: 'good', label: '적정' }
      if (v <= comfort.temperatureMax + 2) return { level: 'warning', label: '더움' }
      return { level: 'serious', label: '매우 더움' }
    },
  },
  {
    key: 'humidity',
    label: '습도',
    unit: '%',
    format: integer,
    minChartSpan: 20,
    assess: (v) => {
      if (v < comfort.humidityMin - 10) return { level: 'serious', label: '매우 건조' }
      if (v < comfort.humidityMin) return { level: 'warning', label: '건조' }
      if (v <= comfort.humidityMax) return { level: 'good', label: '적정' }
      if (v <= comfort.humidityMax + 10) return { level: 'warning', label: '다소 습함' }
      return { level: 'serious', label: '곰팡이 주의' }
    },
    guideline: { value: comfort.humidityMax, label: `적정 상한 ${comfort.humidityMax}%` },
  },
  {
    key: 'co2',
    label: 'CO₂',
    unit: 'ppm',
    format: integer,
    minChartSpan: 400,
    assess: (v) => {
      // 1,000ppm: indoor air quality maintenance standard (실내공기질 관리법)
      if (v <= 1000) return { level: 'good', label: '좋음' }
      if (v <= 2000) return { level: 'warning', label: '환기 필요' }
      return { level: 'serious', label: '나쁨' }
    },
    guideline: { value: 1000, label: '권장 기준 1,000ppm' },
  },
  {
    key: 'pm25',
    label: '초미세먼지',
    unit: 'µg/m³',
    format: integer,
    minChartSpan: 20,
    assess: (v) => dustGrade(v, [15, 35, 75]),
    guideline: { value: 35, label: '보통 상한 35' },
  },
  {
    key: 'pm10',
    label: '미세먼지',
    unit: 'µg/m³',
    format: integer,
    minChartSpan: 30,
    assess: (v) => dustGrade(v, [30, 80, 150]),
    guideline: { value: 80, label: '보통 상한 80' },
  },
]

export const indexMetrics = (list: MetricMeta[]) =>
  Object.fromEntries(list.map((m) => [m.key, m])) as Record<SensorMetric, MetricMeta>

/** Fixed definitions, for what doesn't depend on the user's comfort range. Components use useMetrics(). */
export const metrics = createMetrics()
export const metricByKey = indexMetrics(metrics)

/** The edge measures every 5s; three missed cycles means data is delayed. */
export const STALE_AFTER_MS = 15_000

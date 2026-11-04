import type { AutomationSettings } from '@/api/types'

/**
 * Editable automation thresholds. Add a row here to offer a new one; only those the server
 * actually returns are shown. Ranges are for early feedback, the server has the final say.
 */
export const thresholdFields = [
  { key: 'humidityOn', label: '제습기 켜기', detail: '실내 습도가 이 값 이상이면', unit: '%', min: 30, max: 95 },
  { key: 'humidityOff', label: '제습기 끄기', detail: '실내 습도가 이 값 이하이면', unit: '%', min: 20, max: 90 },
  { key: 'co2Open', label: '환기', detail: '실내 CO₂가 이 값 이상이면 창문 열기', unit: 'ppm', min: 400, max: 5000 },
  { key: 'pm25On', label: '공기청정기 켜기', detail: '초미세먼지가 이 값 이상이면', unit: 'µg/m³', min: 1, max: 500 },
  { key: 'rainProbability', label: '창문 닫기', detail: '강수확률이 이 값 이상이면', unit: '%', min: 0, max: 100 },
] as const

export type ThresholdKey = (typeof thresholdFields)[number]['key']
export type ThresholdErrors = Partial<Record<ThresholdKey, string>>

export const visibleThresholds = (settings: AutomationSettings) =>
  thresholdFields.filter((f) => typeof settings[f.key] === 'number')

/** Checks raw input strings; returns parsed numbers and per-field errors. */
export function validateThresholds(input: Partial<Record<ThresholdKey, string>>) {
  const values: Partial<Record<ThresholdKey, number>> = {}
  const errors: ThresholdErrors = {}

  for (const { key, min, max } of thresholdFields) {
    const raw = input[key]
    if (raw === undefined) continue
    const value = raw.trim() === '' ? NaN : Number(raw)
    if (!Number.isFinite(value)) errors[key] = '숫자를 입력해 주세요.'
    else if (value < min || value > max) errors[key] = `${min}~${max} 사이로 입력해 주세요.`
    else values[key] = value
  }

  // Equal or inverted, the dehumidifier would flip on and off around one value
  const { humidityOn, humidityOff } = values
  if (humidityOn !== undefined && humidityOff !== undefined && humidityOff >= humidityOn) {
    errors.humidityOff = '켜는 습도보다 낮아야 합니다.'
  }
  return { values, errors }
}

import { create } from 'zustand'

/** What this user finds comfortable. Only changes how readings are graded, so it stays on this device. */
export interface ComfortRange {
  temperatureMin: number
  temperatureMax: number
  humidityMin: number
  humidityMax: number
}

export const DEFAULT_COMFORT: ComfortRange = { temperatureMin: 18, temperatureMax: 26, humidityMin: 40, humidityMax: 60 }

const STORAGE_KEY = 'room-care.comfort'
export const COMFORT_LIMITS = { temperature: { min: -10, max: 40 }, humidity: { min: 0, max: 100 } }

export function comfortErrors(c: ComfortRange) {
  const errors: { temperature?: string; humidity?: string } = {}
  const inRange = (v: number, { min, max }: { min: number; max: number }) => Number.isFinite(v) && v >= min && v <= max
  const t = COMFORT_LIMITS.temperature
  const h = COMFORT_LIMITS.humidity
  if (!inRange(c.temperatureMin, t) || !inRange(c.temperatureMax, t)) {
    errors.temperature = `${t.min}~${t.max}°C 사이로 입력해 주세요.`
  } else if (c.temperatureMin >= c.temperatureMax) errors.temperature = '최저가 최고보다 낮아야 합니다.'
  if (!inRange(c.humidityMin, h) || !inRange(c.humidityMax, h)) {
    errors.humidity = `${h.min}~${h.max}% 사이로 입력해 주세요.`
  } else if (c.humidityMin >= c.humidityMax) errors.humidity = '최저가 최고보다 낮아야 합니다.'
  return errors
}

/** Storage can be blocked or hold anything; fall back to defaults rather than break the dashboard */
export function loadComfort(read: () => string | null = () => localStorage.getItem(STORAGE_KEY)): ComfortRange {
  try {
    const raw = read()
    if (!raw) return DEFAULT_COMFORT
    const parsed = { ...DEFAULT_COMFORT, ...(JSON.parse(raw) as Partial<ComfortRange>) }
    return Object.keys(comfortErrors(parsed)).length === 0 ? parsed : DEFAULT_COMFORT
  } catch {
    return DEFAULT_COMFORT
  }
}

export const useComfortStore = create<{ comfort: ComfortRange }>()(() => ({ comfort: loadComfort() }))

export function saveComfort(comfort: ComfortRange) {
  useComfortStore.setState({ comfort })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comfort))
  } catch {
    // Applies for this session even if it can't be remembered
  }
}

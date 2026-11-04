import type { Forecast } from '@/api/types'

const HOUR = 3_600_000
/**
 * FR-02 shows ±2 hours. Data is hourly, so a 12:00 reading is the "2 hours ago" one at 14:30;
 * the extra hour keeps it while still trimming a server that sends a whole day.
 */
const WINDOW_MS = 3 * HOUR
const NOW_WITHIN_MS = HOUR / 2

export interface WeatherSlot {
  time: number
  kind: 'observed' | 'forecast'
  temp: number | null
  humidity: number | null
  precipitationProb: number | null
  precipitation: number | null
  pm25: number | null
}

/** One timeline: measurements for the past, then forecasts for what comes after them */
export function buildWeatherSlots(forecast: Pick<Forecast, 'weather' | 'observations'>, now: number): WeatherSlot[] {
  const observed: WeatherSlot[] = forecast.observations.map((o) => ({
    time: Date.parse(o.time),
    kind: 'observed',
    temp: o.temp,
    humidity: o.humidity,
    precipitation: o.precipitation,
    precipitationProb: null,
    pm25: null,
  }))
  // A measurement beats a forecast for the same hour
  const lastObserved = Math.max(-Infinity, ...observed.map((s) => s.time))
  const predicted: WeatherSlot[] = forecast.weather
    .map((w): WeatherSlot => ({
      time: Date.parse(w.time),
      kind: 'forecast',
      temp: w.temp,
      humidity: w.humidity,
      precipitationProb: w.precipitationProb,
      precipitation: null,
      pm25: w.pm25,
    }))
    .filter((s) => s.time > lastObserved)

  return [...observed, ...predicted]
    .filter((s) => Math.abs(s.time - now) <= WINDOW_MS)
    .sort((a, b) => a.time - b.time)
}

export function slotLabel(time: number, now: number) {
  const diff = time - now
  if (Math.abs(diff) < NOW_WITHIN_MS) return '지금'
  const hours = Math.round(Math.abs(diff) / HOUR)
  return `${hours}시간 ${diff < 0 ? '전' : '후'}`
}

/** Highest chance of rain ahead, or null when the forecast doesn't say */
export function peakRainChance(slots: readonly WeatherSlot[], now: number): number | null {
  const ahead = slots
    .filter((s) => s.kind === 'forecast' && s.time >= now - NOW_WITHIN_MS)
    .map((s) => s.precipitationProb)
    .filter((p) => p !== null)
  return ahead.length > 0 ? Math.max(...ahead) : null
}

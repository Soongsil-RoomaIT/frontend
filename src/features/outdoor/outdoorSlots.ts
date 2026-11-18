import type { Outdoor, OutdoorHour } from '@/api/types'

const HOUR = 3_600_000
/** Forecast values are hourly; a slot's `time` is the start of the hour it describes */
const WINDOW_MS = 2 * HOUR

/** The hourly slots that overlap the two hours either side of now (FR-02), in time order */
export function outdoorSlots(outdoor: Pick<Outdoor, 'hourly'>, now: number): OutdoorHour[] {
  return outdoor.hourly
    .filter((h) => {
      const start = Date.parse(h.time)
      return start + HOUR > now - WINDOW_MS && start <= now + WINDOW_MS
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

/** "지금" for the hour containing now, else whole hours before or after it */
export function slotLabel(time: number, now: number) {
  const diff = time - now
  if (diff <= 0 && diff > -HOUR) return '지금'
  return diff > 0 ? `${Math.ceil(diff / HOUR)}시간 후` : `${Math.floor(-diff / HOUR)}시간 전`
}

/** Highest chance of rain from the current hour on, or null when nothing says */
export function peakRainChance(slots: readonly OutdoorHour[], now: number): number | null {
  const ahead = slots
    .filter((s) => Date.parse(s.time) + HOUR > now)
    .map((s) => s.precipitationProb)
    .filter((p) => p !== null)
  return ahead.length > 0 ? Math.max(...ahead) : null
}

import type { HistoryRange } from '@/api/types'

export const rangeOptions = [
  { value: '1h', label: '1시간' },
  { value: '24h', label: '24시간' },
  { value: '7d', label: '7일' },
] as const satisfies readonly { value: HistoryRange; label: string }[]

const hm = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const md = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' })
const mdLong = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' })

export const formatTick = (range: HistoryRange, t: number) => (range === '7d' ? md.format(t) : hm.format(t))
/** "10:30" for 1h, "10월 1일 10:30" otherwise */
export const formatPointTime = (range: HistoryRange, t: number) =>
  range === '1h' ? hm.format(t) : `${mdLong.format(t)} ${hm.format(t)}`

const MIN = 60_000
const tickStepMs: Record<HistoryRange, number> = { '1h': 10 * MIN, '24h': 3 * 60 * MIN, '7d': 24 * 60 * MIN }

/** Axis ticks on round local times (every 10 min / 3 h / midnight) instead of wherever the data starts. */
export function alignedTicks(range: HistoryRange, min: number, max: number): number[] {
  const step = tickStepMs[range]
  // getTimezoneOffset is UTC minus local, in minutes (KST: -540)
  const offset = new Date(min).getTimezoneOffset() * MIN
  const ticks: number[] = []
  for (let local = Math.ceil((min - offset) / step) * step; local + offset <= max; local += step) {
    ticks.push(local + offset)
  }
  return ticks
}

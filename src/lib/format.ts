/** "방금 전", "12초 전", "3분 전", "2시간 전", "4일 전". Future times (clock skew) clamp to "방금 전". */
export function formatRelative(fromMs: number, nowMs: number) {
  const sec = Math.floor(Math.max(0, nowMs - fromMs) / 1000)
  if (sec < 5) return '방금 전'
  if (sec < 60) return `${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  return `${Math.floor(hour / 24)}일 전`
}

/** "45초", "3분 12초", "1시간 5분" */
export function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`
  if (m > 0) return s > 0 ? `${m}분 ${s}초` : `${m}분`
  return `${s}초`
}

export function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

import { Timer } from 'lucide-react'
import type { Device } from '@/api/types'
import { useNow } from '@/lib/useNow'
import { autoCloseDeadline, DOOR_AUTO_CLOSE_MS, formatCountdown } from './autoClose'

/** FR-03 countdown. Display only: the server/edge does the closing. */
export function AutoCloseCountdown({ device, compact = false }: { device: Device; compact?: boolean }) {
  const now = useNow()
  if (device.type !== 'FRONT_DOOR' || device.state !== 'OPEN') return null

  if (device.autoCloseAt === null) {
    return <p className="text-xs text-muted">자동 닫기 꺼짐</p>
  }
  const deadline = autoCloseDeadline(device)
  if (deadline === null) return null

  const total = Math.max(1, deadline - Date.parse(device.updatedAt)) || DOOR_AUTO_CLOSE_MS
  // `now` from the shared ticker can lag up to a second, which would read "10:01" on a 10-minute timer
  const remaining = Math.min(deadline - now, total)
  const label = remaining > 0 ? `${formatCountdown(remaining)} 후 자동으로 닫힘` : '곧 자동으로 닫힙니다…'
  if (compact) return <p className="text-[11px] text-muted">{label}</p>

  const progress = Math.min(1, Math.max(0, 1 - remaining / total))
  return (
    <div className="space-y-1.5">
      <p className="inline-flex items-center gap-1.5 text-xs font-medium">
        <Timer className="size-3.5 text-status-warning" aria-hidden />
        <span className="tabular-nums">{label}</span>
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-status-warning/20"
        role="progressbar"
        aria-label="자동 닫힘까지 남은 시간"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div className="h-full rounded-full bg-status-warning" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}

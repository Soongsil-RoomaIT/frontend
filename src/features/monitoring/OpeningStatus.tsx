import { DoorClosed, DoorOpen, Grid2x2, RefreshCw, type LucideIcon } from 'lucide-react'
import type { DeviceType } from '@/api/types'
import { AutoCloseCountdown } from '@/features/control/AutoCloseCountdown'
import { formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { useDevices } from './queries'

const openingTypes: { type: DeviceType; openIcon: LucideIcon; closedIcon: LucideIcon }[] = [
  { type: 'WINDOW', openIcon: Grid2x2, closedIcon: Grid2x2 },
  { type: 'FRONT_DOOR', openIcon: DoorOpen, closedIcon: DoorClosed },
]

/** Open/closed state of the window and front door (FR-01). */
export function OpeningStatus() {
  const { data: devices, isPending, isError, isFetching, refetch } = useDevices()
  const now = useNow()

  return (
    <section aria-labelledby="opening-heading">
      <h2 id="opening-heading" className="mb-3 text-base font-semibold">
        개폐 상태
      </h2>
      {isError && !devices ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <span>기기 상태를 불러오지 못했습니다.</span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-bg disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            다시 시도
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {openingTypes.map(({ type, openIcon, closedIcon }) => {
            const device = devices?.find((d) => d.type === type)
            if (isPending) {
              return <div key={type} className="h-[74px] animate-pulse rounded-xl border border-border bg-surface" />
            }
            if (!device) return null
            const open = device.state === 'OPEN'
            const Icon = open ? openIcon : closedIcon
            return (
              <div key={device.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                    open ? 'bg-primary-soft text-primary' : 'bg-bg text-muted'
                  }`}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-xs text-muted">{device.name}</div>
                  <div className="font-semibold">{open ? '열림' : '닫힘'}</div>
                  <div className="truncate text-[11px] text-muted">
                    {formatRelative(Date.parse(device.updatedAt), now)} 변경
                  </div>
                  <AutoCloseCountdown device={device} compact />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

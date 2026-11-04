import { RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { DeviceControlCard } from '@/features/control/DeviceControlCard'
import { useDevices } from '@/features/monitoring/queries'
import { controlDisabledReason, useSystemStatus } from '@/features/monitoring/systemStatus'

export function ControlPage() {
  const { data: devices, isPending, isError, isFetching, refetch } = useDevices()
  const status = useSystemStatus()
  const disabledReason = controlDisabledReason(status)

  return (
    <>
      <PageHeader title="기기 제어" description="창문과 가전을 원격으로 조작합니다." />

      {isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : isError && !devices ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <span>기기 목록을 불러오지 못했습니다.</span>
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
      ) : devices.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">
          등록된 기기가 없습니다.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {devices.map((device) => (
            <DeviceControlCard key={device.id} device={device} disabledReason={disabledReason} />
          ))}
        </div>
      )}
    </>
  )
}

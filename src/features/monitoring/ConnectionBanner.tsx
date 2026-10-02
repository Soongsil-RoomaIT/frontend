import { useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CloudOff, Cpu, RefreshCw, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EdgeRecoveryReport } from '@/api/types'
import { formatClock, formatDuration, formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { dismissRecovery, useRealtimeStore } from '@/stores/realtime'
import { useDevices } from './queries'
import { useSystemStatus } from './systemStatus'

const stateLabel = { OPEN: '열기', CLOSED: '닫기', ON: '켜기', OFF: '끄기' } as const

function Banner({
  icon,
  tone,
  role,
  children,
  action,
  onDismiss,
}: {
  icon: ReactNode
  tone: 'critical' | 'serious' | 'warning' | 'good'
  role: 'alert' | 'status'
  children: ReactNode
  /** Placed under the text on narrow screens, to the right from `sm` up */
  action?: ReactNode
  onDismiss?: () => void
}) {
  const toneClass = {
    critical: 'border-status-critical/40 bg-status-critical/10',
    serious: 'border-status-serious/40 bg-status-serious/10',
    warning: 'border-status-warning/50 bg-status-warning/10',
    good: 'border-status-good/40 bg-status-good/10',
  }[tone]
  return (
    <div role={role} className={`mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm ${toneClass}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        {action && <div className="mt-3 shrink-0 sm:mt-0">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 shrink-0 rounded p-1 text-muted hover:text-fg"
          aria-label="알림 닫기"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

function RecoveryBanner({ report }: { report: EdgeRecoveryReport }) {
  const { data: devices } = useDevices()
  const nameOf = (id: string) => devices?.find((d) => d.id === id)?.name ?? id
  const offlineMs = Date.parse(report.recoveredAt) - Date.parse(report.offlineSince)

  return (
    <Banner
      tone="good"
      role="status"
      icon={<CircleCheck className="size-5 text-status-good" aria-hidden />}
      onDismiss={dismissRecovery}
    >
      <p className="font-semibold">기기 연결이 복구되었습니다</p>
      <p className="mt-0.5 text-muted">
        {formatClock(report.offlineSince)}부터 {formatDuration(offlineMs)} 동안 연결이 끊겨 있었습니다.{' '}
        {report.localActions.length > 0
          ? `그동안 기기가 로컬 자동제어를 ${report.localActions.length}건 실행했습니다.`
          : '그동안 실행된 로컬 자동제어는 없습니다.'}
      </p>
      {report.localActions.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {report.localActions.map((a) => (
            <li key={`${a.executedAt}-${a.deviceId}`} className="text-muted">
              <span className="tabular-nums">{formatClock(a.executedAt)}</span> · {nameOf(a.deviceId)}{' '}
              {stateLabel[a.state]} <span className="text-xs">({a.reason})</span>
            </li>
          ))}
        </ul>
      )}
    </Banner>
  )
}

/**
 * Communication state banner (NFR-03): server unreachable, edge offline / local auto-control,
 * and the recovery summary once the edge comes back.
 */
export function ConnectionBanner() {
  const status = useSystemStatus()
  const recovery = useRealtimeStore((s) => s.recovery)
  const retryNow = useRealtimeStore((s) => s.retryNow)
  const queryClient = useQueryClient()
  const now = useNow()

  const retry = () => {
    retryNow()
    // The banner also covers REST failures while the socket is up; retry those too
    void queryClient.refetchQueries({ type: 'active', predicate: (q) => q.state.status === 'error' })
  }

  if (status.kind === 'server-disconnected') {
    const waitSec = status.nextRetryAt ? Math.max(0, Math.ceil((status.nextRetryAt - now) / 1000)) : null
    return (
      <Banner
        tone="critical"
        role="alert"
        icon={<CloudOff className="size-5 text-status-critical" aria-hidden />}
        action={
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-bg"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            지금 재시도
          </button>
        }
      >
        <p className="font-semibold">서버와 연결이 끊어졌습니다</p>
        <p className="mt-0.5 text-muted">
          화면의 정보가 최신이 아닐 수 있습니다.{' '}
          {waitSec ? `${waitSec}초 후 다시 연결합니다.` : '다시 연결하는 중…'}
        </p>
      </Banner>
    )
  }

  if (status.kind === 'edge-offline') {
    return (
      <Banner tone="serious" role="alert" icon={<TriangleAlert className="size-5 text-status-serious" aria-hidden />}>
        <p className="font-semibold">기기(라즈베리파이)와 통신이 끊어졌습니다</p>
        <p className="mt-0.5 text-muted">
          기기는 자체 자동제어 모드로 전환되어 실내 환경을 계속 관리합니다. 연결이 복구되면 그동안의 동작 내역을
          알려드립니다. (마지막 수신 {formatRelative(Date.parse(status.lastSeenAt), now)})
        </p>
      </Banner>
    )
  }

  // Recovery report outranks the "local mode" notice: it's the more specific, user-relevant message
  if (recovery) return <RecoveryBanner report={recovery} />

  if (status.kind === 'edge-local') {
    return (
      <Banner tone="warning" role="status" icon={<Cpu className="size-5 text-status-warning" aria-hidden />}>
        <p className="font-semibold">기기가 로컬 자동제어 모드로 동작 중입니다</p>
        <p className="mt-0.5 text-muted">클라우드 판단 대신 기기 자체 규칙으로 제어하고 있습니다.</p>
      </Banner>
    )
  }

  return null
}

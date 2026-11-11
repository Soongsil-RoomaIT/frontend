import { Ban, CircleCheck, Clock, Hourglass, LoaderCircle, OctagonAlert, type LucideIcon } from 'lucide-react'
import { createElement, useState } from 'react'
import type { AutomationSettings, Decision, Device } from '@/api/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { actionLabel, actionQuestion, kindOf } from '@/features/control/catalog'
import type { SystemStatus } from '@/features/monitoring/systemStatus'
import { formatRelative } from '@/lib/format'
import { withObjectParticle } from '@/lib/korean'
import { useNow } from '@/lib/useNow'
import { useCommandStore } from '@/stores/commands'
import { approvalBlockReason, decisionStatus, deviceNameOf, isPending, reasonText } from './decisions'
import { useDecisionAction } from './queries'

// Server-sent strings, so own keys only: 'constructor' must not resolve to an inherited function
const lookup = <T,>(map: Record<string, T>, key: string) => (Object.hasOwn(map, key) ? map[key] : undefined)

const statusIcon: Record<string, LucideIcon> = {
  PROPOSED: Hourglass,
  APPROVED: LoaderCircle,
  EXECUTED: CircleCheck,
  FAILED: OctagonAlert,
  REJECTED: Ban,
  EXPIRED: Clock,
}

const statusIconColor: Record<string, string> = {
  PROPOSED: 'text-status-warning',
  APPROVED: 'animate-spin text-primary',
  EXECUTED: 'text-status-good',
  FAILED: 'text-status-critical',
}

interface DecisionCardProps {
  decision: Decision
  devices: readonly Device[] | undefined
  devicesLoading: boolean
  status: SystemStatus
  settings: AutomationSettings | undefined
}

export function DecisionCard({ decision, devices, devicesLoading, status, settings }: DecisionCardProps) {
  const now = useNow()
  const action = useDecisionAction(decision.id)
  const commandPending = useCommandStore((s) => decision.deviceId in s.pending)
  const [confirming, setConfirming] = useState(false)

  const device = devices?.find((d) => d.id === decision.deviceId)
  const kind = kindOf(device?.type ?? '')
  const name = deviceNameOf(decision.deviceId, devices)
  const meta = decisionStatus(decision.status)
  const pending = isPending(decision)
  const autoMode = settings?.enabled === true && settings.mode === 'AUTO'
  const blockReason = approvalBlockReason(decision, device, status, commandPending, devicesLoading)
  const safetyNote = kind.confirm?.(decision.action) ?? null
  const icon = createElement(kind.icon(device?.state ?? 'CLOSED'), { className: 'size-5', 'aria-hidden': true })
  const createdMs = decision.createdAt ? Date.parse(decision.createdAt) : null
  const reasons = decision.reasons ?? []

  // Same rule as the control card: a stale confirmation must not linger or come back later
  const dialogOpen = confirming && pending && blockReason === null && !action.isPending
  if (confirming && !dialogOpen) setConfirming(false)

  return (
    <article className="rounded-xl border border-border bg-surface p-4" aria-label={`${name} ${actionLabel[decision.action]}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg text-muted">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="font-semibold">
              {name} {actionLabel[decision.action]}
            </h3>
            <span className="inline-flex items-center gap-1 text-xs font-medium">
              {createElement(lookup(statusIcon, decision.status) ?? Clock, {
                className: `size-4 ${lookup(statusIconColor, decision.status) ?? 'text-muted'}`,
                'aria-hidden': true,
              })}
              {pending && autoMode ? '자동 실행 대기' : meta.label}
            </span>
          </div>
          {reasons.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
              {reasons.map((r, i) => (
                <li key={i}>{reasonText(r)}</li>
              ))}
            </ul>
          )}
          {decision.status === 'FAILED' && decision.reason && <p className="mt-1.5 text-sm">{decision.reason}</p>}
          {createdMs !== null && <p className="mt-1 text-xs text-muted">{formatRelative(createdMs, now)}</p>}
        </div>
      </div>

      {pending && !autoMode && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={action.isPending}
              onClick={() => action.mutate('reject')}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-bg disabled:opacity-50"
            >
              거절
            </button>
            <button
              type="button"
              disabled={action.isPending || blockReason !== null}
              onClick={() => (safetyNote ? setConfirming(true) : action.mutate('approve'))}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:text-bg"
            >
              {action.isPending ? '처리 중…' : '승인'}
            </button>
          </div>
          {blockReason && <p className="text-xs text-muted">{blockReason}</p>}
        </div>
      )}

      <ConfirmDialog
        open={dialogOpen}
        title={`${withObjectParticle(name)} ${actionQuestion[decision.action]}`}
        message={safetyNote ?? ''}
        confirmLabel={actionLabel[decision.action]}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          action.mutate('approve')
        }}
      />
    </article>
  )
}

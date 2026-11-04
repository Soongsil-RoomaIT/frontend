import { ArrowRight, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { createElement, useState } from 'react'
import type { Device, DeviceAction } from '@/api/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { formatRelative } from '@/lib/format'
import { withObjectParticle } from '@/lib/korean'
import { useNow } from '@/lib/useNow'
import { clearCommandError, useCommandStore } from '@/stores/commands'
import { AutoCloseCountdown } from './AutoCloseCountdown'
import {
  actionLabel,
  actionQuestion,
  availableActions,
  isControllable,
  kindOf,
  progressLabel,
  stateLabel,
} from './catalog'
import { runDeviceCommand } from './commands'

/** NFR-02: past this, say we're still waiting rather than look stuck */
const SLOW_AFTER_MS = 5_000

interface DeviceControlCardProps {
  device: Device
  /** Why controls are off right now (connection lost, ...); null when usable */
  disabledReason: string | null
}

export function DeviceControlCard({ device, disabledReason }: DeviceControlCardProps) {
  const pending = useCommandStore((s) => s.pending[device.id])
  const error = useCommandStore((s) => s.lastError[device.id])
  const now = useNow()
  const [confirming, setConfirming] = useState<DeviceAction | null>(null)

  const kind = kindOf(device.type)
  // Selects an existing icon component; createElement makes it clear nothing is defined per render
  const icon = createElement(kind.icon(device.state), { className: 'size-5', 'aria-hidden': true })
  const actions = availableActions(device)
  const controllable = isControllable(device)
  const assumed = device.stateSource === 'ASSUMED'

  const start = (action: DeviceAction) => {
    if (kind.confirm?.(action)) setConfirming(action)
    else runDeviceCommand(device, action)
  }

  // Drop a stale confirmation if the action stopped making sense while the dialog was open
  // (door auto-closed, connection lost, another command started)
  const confirmAction =
    confirming && actions.includes(confirming) && disabledReason === null && !pending ? confirming : null
  // Forget it entirely, or the dialog would pop back up the next time the action becomes possible
  // (e.g. the door opens again). Setting state during render is React's pattern for this.
  if (confirming !== null && confirmAction === null) setConfirming(null)

  const elapsed = pending ? now - pending.startedAt : 0
  const footnote =
    actions.length > 0
      ? disabledReason
      : !controllable
        ? '원격 조작을 지원하지 않는 기기입니다'
        : (kind.noActionHint?.(device.state) ?? null)

  return (
    <article
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
      aria-labelledby={`device-${device.id}-name`}
      aria-busy={pending ? true : undefined}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
            device.state === 'OPEN' || device.state === 'ON' ? 'bg-primary-soft text-primary' : 'bg-bg text-muted'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`device-${device.id}-name`} className="font-semibold">
              {device.name}
            </h2>
            {assumed && (
              <span
                className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted"
                title="기기에서 실제 상태를 받을 수 없어, 마지막으로 보낸 명령 기준으로 표시합니다"
              >
                상태 추정
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm">
            <span className="font-medium">{stateLabel[device.state]}</span>
            {/* The pending intent is shown, but the real state only changes once the device confirms */}
            {pending && (
              <>
                <ArrowRight className="size-3.5 text-muted" aria-hidden />
                <span className="text-muted">{stateLabel[pending.target]}</span>
              </>
            )}
            <span className="text-xs text-muted">· {formatRelative(Date.parse(device.updatedAt), now)} 변경</span>
          </p>
        </div>
      </div>

      {!pending && <AutoCloseCountdown device={device} />}

      {error && !pending && (
        <div className="flex items-start gap-2 rounded-lg border border-status-critical/30 bg-status-critical/10 p-2.5 text-xs">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-status-critical" aria-hidden />
          <p className="min-w-0 flex-1">{error || '명령을 수행하지 못했습니다.'}</p>
          <button
            type="button"
            onClick={() => clearCommandError(device.id)}
            className="-m-1 shrink-0 rounded p-1 text-muted hover:text-fg"
            aria-label="오류 닫기"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="mt-auto space-y-2">
        {pending ? (
          <div role="status" className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2.5 text-sm">
            <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
            <span className="font-medium">{progressLabel[pending.action]}…</span>
            {elapsed >= 1_000 && (
              <span className="ml-auto text-xs text-muted tabular-nums">
                {elapsed >= SLOW_AFTER_MS ? '응답 대기 중 · ' : ''}
                {Math.floor(elapsed / 1000)}초
              </span>
            )}
          </div>
        ) : (
          actions.length > 0 && (
            <div className="flex gap-2">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={disabledReason !== null}
                  onClick={() => start(action)}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:text-bg"
                >
                  {device.name} {actionLabel[action]}
                </button>
              ))}
            </div>
          )
        )}
        {!pending && footnote && <p className="text-xs text-muted">{footnote}</p>}
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction ? `${withObjectParticle(device.name)} ${actionQuestion[confirmAction]}` : ''}
        message={confirmAction ? (kind.confirm?.(confirmAction) ?? '') : ''}
        confirmLabel={confirmAction ? actionLabel[confirmAction] : ''}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null)
          if (confirmAction) runDeviceCommand(device, confirmAction)
        }}
      />
    </article>
  )
}

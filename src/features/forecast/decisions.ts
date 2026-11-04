import type { Decision, DecisionReason, Device, KnownDecisionStatus } from '@/api/types'
import { actionLabel, stateLabel, targetState } from '@/features/control/catalog'
import type { Level } from '@/features/monitoring/metrics'
import { controlDisabledReason, type SystemStatus } from '@/features/monitoring/systemStatus'

const statusMeta: Record<KnownDecisionStatus, { label: string; level: Level | null }> = {
  PROPOSED: { label: '승인 대기', level: 'warning' },
  APPROVED: { label: '실행 중', level: null },
  EXECUTED: { label: '실행 완료', level: 'good' },
  REJECTED: { label: '거절함', level: null },
  FAILED: { label: '실행 실패', level: 'critical' },
  EXPIRED: { label: '만료됨', level: null },
}

const isKnownStatus = (status: string): status is KnownDecisionStatus => Object.hasOwn(statusMeta, status)

/** An unknown status from a newer server is shown as sent rather than hidden */
export const decisionStatus = (status: string) =>
  isKnownStatus(status) ? statusMeta[status] : { label: status, level: null }

export const isPending = (decision: Decision) => decision.status === 'PROPOSED'

const createdMs = (d: Decision) => (d.createdAt ? Date.parse(d.createdAt) : 0)

/** Newest first; decisions without a time keep the server's order at the end */
export const sortDecisions = (decisions: Decision[]) => [...decisions].sort((a, b) => createdMs(b) - createdMs(a))

export const deviceNameOf = (deviceId: string, devices: readonly Device[] | undefined) =>
  devices?.find((d) => d.id === deviceId)?.name ?? deviceId

export const decisionTitle = (decision: Decision, devices: readonly Device[] | undefined) =>
  `${deviceNameOf(decision.deviceId, devices)} ${actionLabel[decision.action]}`

/** "강수확률 80% (기준 60% 이상)" */
export const reasonText = ({ factor, value, threshold }: DecisionReason) =>
  `${factor} ${value}${threshold === undefined || threshold === null ? '' : ` (기준 ${threshold})`}`

export type DecisionEvent = { kind: 'proposed' | 'executed' | 'failed'; decision: Decision }

/**
 * What changed between two views of the decision list, for alerting. Compares states rather
 * than reacting to messages, so it works the same whether a change came by push or by polling.
 */
export function diffDecisions(previous: ReadonlyMap<string, string>, next: readonly Decision[]): DecisionEvent[] {
  const events: DecisionEvent[] = []
  for (const decision of next) {
    const before = previous.get(decision.id)
    if (before === decision.status) continue
    if (decision.status === 'EXECUTED') events.push({ kind: 'executed', decision })
    else if (decision.status === 'FAILED') events.push({ kind: 'failed', decision })
    else if (decision.status === 'PROPOSED' && before === undefined) events.push({ kind: 'proposed', decision })
  }
  return events
}

/** Why a recommendation can't be approved right now; null when it can */
export function approvalBlockReason(
  decision: Decision,
  device: Device | undefined,
  status: SystemStatus,
  commandPending: boolean,
  devicesLoading: boolean,
): string | null {
  const connection = controlDisabledReason(status)
  if (connection) return connection
  if (status.kind === 'edge-local') return '기기가 자체 제어 중이라 지금은 승인할 수 없습니다.'
  // The door's safety check depends on knowing what the device is
  if (!device && devicesLoading) return '기기 정보를 확인하는 중입니다.'
  if (commandPending) return '이 기기가 다른 명령을 처리하고 있습니다.'
  const target = targetState[decision.action]
  if (device?.state === target) return `이미 ${stateLabel[target]} 상태입니다.`
  return null
}

import type { AutomationRule, KnownRecommendationStatus, Recommendation } from '@/api/types'
import { describeRule } from '@/features/automation/automationModel'
import type { Level } from '@/features/monitoring/metrics'

const statusMeta: Record<KnownRecommendationStatus, { label: string; level: Level | null }> = {
  PROPOSED: { label: '적용 대기', level: 'warning' },
  APPLIED: { label: '적용됨', level: 'good' },
  REJECTED: { label: '거절함', level: null },
  REVERTED: { label: '되돌림', level: null },
}

const isKnownStatus = (s: string): s is KnownRecommendationStatus => Object.hasOwn(statusMeta, s)

/** An unknown status from a newer server is shown as sent rather than hidden */
export const recommendationStatus = (status: string) =>
  isKnownStatus(status) ? statusMeta[status] : { label: status, level: null }

export const isProposed = (r: Recommendation) => r.status === 'PROPOSED'
export const isApplied = (r: Recommendation) => r.status === 'APPLIED'

const createdMs = (r: Recommendation) => (r.createdAt ? Date.parse(r.createdAt) : 0)
/** Newest first; undated ones keep the server's order at the end */
export const sortRecommendations = (items: readonly Recommendation[]) =>
  [...items].sort((a, b) => createdMs(b) - createdMs(a))

/** Display details for the rule a recommendation targets, from the automation config when loaded */
export function targetRule(recommendation: Recommendation, rules: readonly AutomationRule[] | undefined) {
  const rule = rules?.find((r) => r.id === recommendation.metric || r.metric === recommendation.metric)
  const info = describeRule(
    rule ?? {
      id: recommendation.metric,
      metric: recommendation.metric,
      threshold: recommendation.current ?? recommendation.proposed,
      enabled: null,
      label: null,
      description: null,
      unit: null,
      min: null,
      max: null,
    },
  )
  // The live threshold is the better "current" once the config is loaded
  return { ...info, current: recommendation.current ?? rule?.threshold ?? null }
}

/** "현재 70% → 추천 66%" */
export function changeText(current: number | null, proposed: number, unit: string) {
  const fmt = (v: number) => `${v}${unit}`
  return current === null ? `추천 ${fmt(proposed)}` : `현재 ${fmt(current)} → 추천 ${fmt(proposed)}`
}

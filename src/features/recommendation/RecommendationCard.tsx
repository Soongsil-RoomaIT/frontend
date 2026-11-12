import { ArrowRight, Ban, CircleCheck, Hourglass, Lightbulb, RefreshCw, Undo2, type LucideIcon } from 'lucide-react'
import { createElement } from 'react'
import type { AutomationRule, Recommendation } from '@/api/types'
import { useAutomation } from '@/features/automation/queries'
import { formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { useRecommendationAction } from './queries'
import { changeText, isApplied, isProposed, recommendationStatus, sortRecommendations, targetRule } from './recommendations'
import { useRecommendations } from './queries'

const statusIcon: Record<string, LucideIcon> = { PROPOSED: Hourglass, APPLIED: CircleCheck, REJECTED: Ban, REVERTED: Undo2 }
const statusColor: Record<string, string> = { PROPOSED: 'text-status-warning', APPLIED: 'text-status-good' }
// Server-sent strings, so own keys only: 'constructor' must not resolve to an inherited function
const lookup = <T,>(map: Record<string, T>, key: string) => (Object.hasOwn(map, key) ? map[key] : undefined)

function Card({ r, rules }: { r: Recommendation; rules: readonly AutomationRule[] | undefined }) {
  const now = useNow()
  const action = useRecommendationAction(r.id)
  const rule = targetRule(r, rules)
  const meta = recommendationStatus(r.status)
  const createdMs = r.createdAt ? Date.parse(r.createdAt) : null
  const busy = action.isPending

  return (
    <article className="rounded-xl border border-border bg-surface p-4" aria-label={`${rule.label} 추천`}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg text-muted">
          <Lightbulb className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="font-semibold">{rule.label}</h3>
            <span className="inline-flex items-center gap-1 text-xs font-medium">
              {createElement(lookup(statusIcon, r.status) ?? Hourglass, {
                className: `size-4 ${lookup(statusColor, r.status) ?? 'text-muted'}`,
                'aria-hidden': true,
              })}
              {meta.label}
            </span>
          </div>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm tabular-nums">
            {changeText(rule.current, r.proposed, rule.unit)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {r.evidenceCount !== null && `근거: 수동 조작 ${r.evidenceCount}건`}
            {r.evidenceCount !== null && r.reason && ' · '}
            {r.reason}
          </p>
          {rule.description && <p className="mt-0.5 text-xs text-muted">{rule.description}</p>}
          {createdMs !== null && <p className="mt-1 text-xs text-muted">{formatRelative(createdMs, now)}</p>}
        </div>
      </div>

      {isProposed(r) && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => action.mutate('reject')}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-bg disabled:opacity-50"
          >
            거절
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => action.mutate('apply')}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:text-bg"
          >
            {busy ? '처리 중…' : '적용'}
            {!busy && <ArrowRight className="size-4" aria-hidden />}
          </button>
        </div>
      )}
      {isApplied(r) && (
        <div className="mt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => action.mutate('revert')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg disabled:opacity-50"
          >
            <Undo2 className="size-4" aria-hidden />
            {busy ? '처리 중…' : '이전 값으로 되돌리기'}
          </button>
        </div>
      )}
    </article>
  )
}

const HISTORY_LIMIT = 5

/** AI threshold recommendations: proposed ones to act on, then recent decisions (SAD ADR-011 ②) */
export function RecommendationSection() {
  const { data, isPending, isError, refetch, isFetching } = useRecommendations()
  const { data: automation } = useAutomation()

  const sorted = sortRecommendations(data?.items ?? [])
  // Proposed ones need an answer; applied ones stay in view so they can be reverted any time
  const active = sorted.filter((r) => isProposed(r) || isApplied(r))
  const history = sorted.filter((r) => !isProposed(r) && !isApplied(r)).slice(0, HISTORY_LIMIT)

  return (
    <section aria-labelledby="recommendation-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="recommendation-heading" className="inline-flex items-center gap-1.5 text-base font-semibold">
          <Lightbulb className="size-4 text-muted" aria-hidden />
          AI 기준값 추천
        </h2>
        <p className="text-xs text-muted">제습기를 손으로 켜고 끈 기록으로 계산합니다. 적용을 눌러야 반영됩니다.</p>
      </div>

      {isPending ? (
        <div className="h-32 animate-pulse rounded-xl border border-border bg-surface" />
      ) : isError && !data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <span>추천을 불러오지 못했습니다.</span>
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
        <div className="space-y-3">
          {active.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {active.map((r) => (
                <Card key={r.id} r={r} rules={automation?.rules} />
              ))}
            </div>
          ) : data?.progress ? (
            <div className="rounded-xl border border-border bg-surface p-5 text-sm">
              <p className="font-medium">
                데이터 수집 중 ({Math.min(data.progress.count, data.progress.required)}/{data.progress.required})
              </p>
              <p className="mt-1 text-muted">제습기 수동 조작이 {data.progress.required}건 쌓이면 기준값을 추천합니다.</p>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary-soft"
                role="progressbar"
                aria-label="추천에 필요한 수동 조작"
                aria-valuemin={0}
                aria-valuemax={data.progress.required}
                aria-valuenow={Math.min(data.progress.count, data.progress.required)}
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, (data.progress.count / data.progress.required) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
              지금은 새로 추천할 기준값이 없습니다.
            </p>
          )}

          {history.length > 0 && (
            <details className="rounded-xl border border-border bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">최근 처리한 추천 {history.length}건</summary>
              <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">
                {history.map((r) => (
                  <Card key={r.id} r={r} rules={automation?.rules} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

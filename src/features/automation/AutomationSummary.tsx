import { ArrowRight, Bot } from 'lucide-react'
import { Link } from 'react-router'
import { Switch } from '@/components/Switch'
import { useAutomation, useUpdateAutomation } from './queries'

/** Dashboard shortcut: is automation running */
export function AutomationSummary() {
  const { data: automation, isPending, isError, refetch, isFetching } = useAutomation()
  const update = useUpdateAutomation()

  const activeRules = automation?.rules.filter((r) => r.enabled !== false).length ?? 0
  const summary = automation
    ? automation.enabled === false
      ? '꺼짐 · 자동으로 조작하지 않습니다'
      : `${automation.enabled === true ? '켜짐 · ' : ''}규칙 ${activeRules}개 적용 중`
    : isPending
      ? '불러오는 중…'
      : '상태를 불러오지 못했습니다'

  return (
    <section
      aria-label="자동제어"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Bot className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">자동제어</h2>
        <p className="text-sm text-muted">{summary}</p>
      </div>
      <div className="flex items-center gap-4">
        <Link to="/settings" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          설정 <ArrowRight className="size-4" aria-hidden />
        </Link>
        {automation ? (
          automation.enabled !== null && (
            <Switch
              label="자동제어 사용"
              checked={automation.enabled}
              disabled={update.isPending}
              onChange={(enabled) => update.mutate({ enabled })}
            />
          )
        ) : (
          isError && (
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg disabled:opacity-50"
            >
              다시 시도
            </button>
          )
        )}
      </div>
    </section>
  )
}

import { ArrowRight, Bot } from 'lucide-react'
import { Link } from 'react-router'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Switch } from '@/components/Switch'
import { useAutomationSettings } from './queries'
import { modeLabel, useAutomationChange } from './useAutomationChange'

/** Dashboard shortcut: is automation running, and in which mode */
export function AutomationSummary() {
  const { data: settings, isPending, isError, refetch, isFetching } = useAutomationSettings()
  const { request, isSaving, confirm } = useAutomationChange(settings)

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
        <p className="text-sm text-muted">
          {settings
            ? settings.enabled
              ? `켜짐 · ${modeLabel[settings.mode]}`
              : '꺼짐 · 새 추천이 만들어지지 않습니다'
            : isPending
              ? '불러오는 중…'
              : '상태를 불러오지 못했습니다'}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <Link to="/settings" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          설정 <ArrowRight className="size-4" aria-hidden />
        </Link>
        {settings ? (
          <Switch
            label="자동제어 사용"
            checked={settings.enabled}
            disabled={isSaving}
            onChange={(enabled) => request({ enabled })}
          />
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
      <ConfirmDialog {...confirm} />
    </section>
  )
}

import { RefreshCw } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type { Automation, AutomationRule } from '@/api/types'
import { Switch } from '@/components/Switch'
import { describeRule, validateRules } from './automationModel'
import { useAutomation, useUpdateAutomation } from './queries'

function RuleRow({
  rule,
  value,
  error,
  disabled,
  onChange,
  onToggle,
}: {
  rule: AutomationRule
  value: string
  error: string | undefined
  disabled: boolean
  onChange: (value: string) => void
  onToggle: ((enabled: boolean) => void) | null
}) {
  const id = useId()
  const info = describeRule(rule)
  const off = rule.enabled === false
  return (
    <div className={`rounded-lg border border-border p-3 ${off ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="block text-sm font-medium">
            {info.label}
          </label>
          {info.description && (
            <p id={`${id}-help`} className="text-xs text-muted">
              {info.description}
            </p>
          )}
        </div>
        {onToggle && <Switch label={`${info.label} 규칙 사용`} checked={rule.enabled === true} disabled={disabled} onChange={onToggle} />}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={info.min ?? undefined}
          max={info.max ?? undefined}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${info.description ? `${id}-help` : ''}${error ? ` ${id}-error` : ''}`.trim() || undefined}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums aria-invalid:border-status-critical"
        />
        <span className="text-sm text-muted">{info.unit}</span>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-status-critical">
          {error}
        </p>
      )}
    </div>
  )
}

function Rules({ automation }: { automation: Automation }) {
  const update = useUpdateAutomation()
  // Only what the user edited. Everything else keeps following the server's value.
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [showErrors, setShowErrors] = useState(false)

  const rules = automation.rules
  const current: Record<string, string> = Object.fromEntries(
    rules.map((r) => [r.id, Object.hasOwn(draft, r.id) ? draft[r.id]! : String(r.threshold)]),
  )
  const { values, errors } = validateRules(rules, current)
  const dirty = rules.some((r) => Object.hasOwn(draft, r.id) && draft[r.id] !== String(r.threshold))
  const hasErrors = Object.keys(errors).length > 0

  if (rules.length === 0) {
    return <p className="text-sm text-muted">서버가 조정할 수 있는 기준값을 아직 제공하지 않습니다.</p>
  }

  const reset = () => {
    setDraft({})
    setShowErrors(false)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setShowErrors(true)
    if (hasErrors || !dirty || update.isPending) return
    const changed = Object.fromEntries(
      rules.filter((r) => Object.hasOwn(values, r.id) && values[r.id] !== r.threshold).map((r) => [r.id, { threshold: values[r.id] }]),
    )
    update.mutate({ rules: changed }, { onSuccess: reset })
  }

  return (
    <form onSubmit={submit} noValidate className="border-t border-border pt-5">
      <h3 className="font-semibold">동작 기준</h3>
      <p className="mt-1 text-sm text-muted">이 기준을 넘으면 자동으로 동작합니다.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            value={current[rule.id] ?? ''}
            error={showErrors ? errors[rule.id] : undefined}
            disabled={update.isPending}
            onChange={(value) => setDraft((d) => ({ ...d, [rule.id]: value }))}
            onToggle={rule.enabled === null ? null : (enabled) => update.mutate({ rules: { [rule.id]: { enabled } } })}
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={!dirty || update.isPending}
          onClick={reset}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-bg disabled:opacity-50"
        >
          되돌리기
        </button>
        <button
          type="submit"
          disabled={!dirty || update.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:text-bg"
        >
          {update.isPending ? '저장 중…' : '기준 저장'}
        </button>
      </div>
    </form>
  )
}

/** Automation master switch and rule thresholds (SAD v1.2: actions run without approval, ADR-012) */
export function AutomationForm() {
  const { data: automation, isPending, isError, refetch, isFetching } = useAutomation()
  const update = useUpdateAutomation()

  if (isPending) return <div className="h-48 animate-pulse rounded-xl border border-border bg-surface" />
  if (isError && !automation) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
        <span>자동제어 설정을 불러오지 못했습니다.</span>
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
    )
  }
  if (!automation) return null

  return (
    <section aria-labelledby="automation-heading" className="space-y-5 rounded-xl border border-border bg-surface p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="automation-heading" className="font-semibold">
            자동제어
          </h2>
          <p className="mt-1 text-sm text-muted">
            바깥 공기·예보와 실내 습도를 보고 창문과 가전을 승인 없이 조작하고, 결과를 알림으로 알려줍니다.
          </p>
        </div>
        {automation.enabled !== null && (
          <Switch
            label="자동제어 사용"
            checked={automation.enabled}
            disabled={update.isPending}
            onChange={(enabled) => update.mutate({ enabled })}
          />
        )}
      </div>

      {automation.enabled === false && (
        <p className="rounded-lg bg-bg px-3 py-2 text-sm text-muted">
          꺼져 있는 동안에는 자동으로 조작하지 않습니다. 현관문 자동 닫기는 기기가 따로 처리합니다.
        </p>
      )}

      <Rules automation={automation} />
    </section>
  )
}

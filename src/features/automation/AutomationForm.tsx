import { RefreshCw } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type { AutomationMode, AutomationSettings } from '@/api/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Switch } from '@/components/Switch'
import { useAutomationSettings, useUpdateAutomation } from './queries'
import { validateThresholds, visibleThresholds, type ThresholdKey } from './thresholds'
import { modeLabel, useAutomationChange } from './useAutomationChange'

const modeOptions: { value: AutomationMode; label: string }[] = [
  { value: 'APPROVAL', label: modeLabel.APPROVAL },
  { value: 'AUTO', label: modeLabel.AUTO },
]

const modeHelp: Record<AutomationMode, string> = {
  APPROVAL: '시스템이 동작을 추천하고, 사용자가 승인하면 실행합니다.',
  AUTO: '조건이 맞으면 승인 없이 바로 실행하고 결과를 알려줍니다.',
}

function ThresholdFields({ settings }: { settings: AutomationSettings }) {
  const update = useUpdateAutomation()
  const baseId = useId()
  // Only what the user edited. Everything else keeps following the server's value.
  const [draft, setDraft] = useState<Partial<Record<ThresholdKey, string>>>({})
  const [showErrors, setShowErrors] = useState(false)

  const fields = visibleThresholds(settings)
  const current = Object.fromEntries(
    fields.map((f) => [f.key, draft[f.key] ?? String(settings[f.key])]),
  ) as Partial<Record<ThresholdKey, string>>
  const { values, errors } = validateThresholds(current)
  const dirty = fields.some((f) => draft[f.key] !== undefined && draft[f.key] !== String(settings[f.key]))
  const hasErrors = Object.keys(errors).length > 0

  if (fields.length === 0) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setShowErrors(true)
    if (hasErrors || !dirty || update.isPending) return
    update.mutate(values, {
      onSuccess: () => {
        setDraft({})
        setShowErrors(false)
      },
    })
  }

  return (
    <form onSubmit={submit} noValidate className="border-t border-border pt-5">
      <h3 className="font-semibold">동작 기준</h3>
      <p className="mt-1 text-sm text-muted">이 기준을 넘으면 추천하거나 실행합니다.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `${baseId}-${f.key}`
          const error = showErrors ? errors[f.key] : undefined
          return (
            <div key={f.key}>
              <label htmlFor={id} className="block text-sm font-medium">
                {f.label}
              </label>
              <p id={`${id}-help`} className="text-xs text-muted">
                {f.detail}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  min={f.min}
                  max={f.max}
                  value={current[f.key] ?? ''}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums aria-invalid:border-status-critical"
                />
                <span className="text-sm text-muted">{f.unit}</span>
              </div>
              {error && (
                <p id={`${id}-error`} className="mt-1 text-xs font-medium text-status-critical">
                  {error}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={!dirty || update.isPending}
          onClick={() => {
            setDraft({})
            setShowErrors(false)
          }}
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

export function AutomationForm() {
  const { data: settings, isPending, isError, refetch, isFetching } = useAutomationSettings()
  const { request, isSaving, confirm } = useAutomationChange(settings)

  if (isPending) return <div className="h-48 animate-pulse rounded-xl border border-border bg-surface" />
  if (isError && !settings) {
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

  return (
    <section aria-labelledby="automation-heading" className="space-y-5 rounded-xl border border-border bg-surface p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="automation-heading" className="font-semibold">
            자동제어
          </h2>
          <p className="mt-1 text-sm text-muted">날씨와 실내 환경을 보고 창문과 가전을 관리합니다.</p>
        </div>
        <Switch
          label="자동제어 사용"
          checked={settings.enabled}
          disabled={isSaving}
          onChange={(enabled) => request({ enabled })}
        />
      </div>

      {!settings.enabled && (
        <p className="rounded-lg bg-bg px-3 py-2 text-sm text-muted">
          꺼져 있는 동안에는 새 추천이 만들어지지 않고 자동으로 실행되지 않습니다.
        </p>
      )}

      <div>
        <SegmentedControl
          label="실행 방식"
          options={modeOptions}
          value={settings.mode}
          onChange={(mode) => {
            if (!isSaving && mode !== settings.mode) request({ mode })
          }}
        />
        <p className="mt-2 text-sm text-muted">{modeHelp[settings.mode]}</p>
      </div>

      <ThresholdFields settings={settings} />
      <ConfirmDialog {...confirm} />
    </section>
  )
}

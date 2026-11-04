import { useId, useState, type FormEvent } from 'react'
import { comfortErrors, DEFAULT_COMFORT, saveComfort, useComfortStore, type ComfortRange } from '@/stores/comfort'
import { showToast } from '@/stores/toasts'

type Draft = Record<keyof ComfortRange, string>

const toDraft = (c: ComfortRange): Draft => ({
  temperatureMin: String(c.temperatureMin),
  temperatureMax: String(c.temperatureMax),
  humidityMin: String(c.humidityMin),
  humidityMax: String(c.humidityMax),
})

const toRange = (d: Draft): ComfortRange => ({
  temperatureMin: d.temperatureMin.trim() === '' ? NaN : Number(d.temperatureMin),
  temperatureMax: d.temperatureMax.trim() === '' ? NaN : Number(d.temperatureMax),
  humidityMin: d.humidityMin.trim() === '' ? NaN : Number(d.humidityMin),
  humidityMax: d.humidityMax.trim() === '' ? NaN : Number(d.humidityMax),
})

const rows = [
  { label: '온도', unit: '°C', min: 'temperatureMin', max: 'temperatureMax', error: 'temperature' },
  { label: '습도', unit: '%', min: 'humidityMin', max: 'humidityMax', error: 'humidity' },
] as const

/** Grades shown next to readings on the dashboard and history chart. Never moves a device. */
export function ComfortForm() {
  const comfort = useComfortStore((s) => s.comfort)
  const [draft, setDraft] = useState(() => toDraft(comfort))
  const [showErrors, setShowErrors] = useState(false)
  const baseId = useId()

  const range = toRange(draft)
  const errors = comfortErrors(range)
  const dirty = (Object.keys(range) as (keyof ComfortRange)[]).some((k) => range[k] !== comfort[k])
  const isDefault = (Object.keys(range) as (keyof ComfortRange)[]).every((k) => range[k] === DEFAULT_COMFORT[k])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setShowErrors(true)
    if (Object.keys(errors).length > 0 || !dirty) return
    saveComfort(range)
    setShowErrors(false)
    showToast({ tone: 'success', title: '표시 기준을 저장했습니다' })
  }

  const input = (key: keyof ComfortRange, label: string, invalid: boolean) => (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      value={draft[key]}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums aria-invalid:border-status-critical"
    />
  )

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${baseId}-heading`}
      className="rounded-xl border border-border bg-surface p-4 md:p-5"
    >
      <h2 id={`${baseId}-heading`} className="font-semibold">
        적정 범위 표시
      </h2>
      <p className="mt-1 text-sm text-muted">
        대시보드의 "적정" 표시 기준입니다. 기기를 움직이지 않으며, 이 브라우저에만 저장됩니다.
      </p>
      <div className="mt-4 space-y-4">
        {rows.map((row) => {
          const error = showErrors ? errors[row.error] : undefined
          return (
            <div key={row.label}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-10 font-medium">{row.label}</span>
                {input(row.min, `${row.label} 적정 최저`, Boolean(error))}
                <span className="text-muted">~</span>
                {input(row.max, `${row.label} 적정 최고`, Boolean(error))}
                <span className="text-muted">{row.unit}</span>
              </div>
              {error && <p className="mt-1 text-xs font-medium text-status-critical">{error}</p>}
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={isDefault}
          onClick={() => {
            setDraft(toDraft(DEFAULT_COMFORT))
            setShowErrors(false)
          }}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-bg disabled:opacity-50"
        >
          기본값으로
        </button>
        <button
          type="submit"
          disabled={!dirty}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:text-bg"
        >
          범위 저장
        </button>
      </div>
    </form>
  )
}

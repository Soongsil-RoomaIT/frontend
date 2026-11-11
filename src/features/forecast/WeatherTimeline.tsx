import { Clock, CloudRain, Droplets, Thermometer, Umbrella, Wind, type LucideIcon } from 'lucide-react'
import type { Forecast } from '@/api/types'
import { formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { metricByKey } from '@/features/monitoring/metrics'
import { LevelBadge } from '@/features/monitoring/LevelBadge'
import { buildWeatherSlots, peakRainChance, slotLabel, type WeatherSlot } from './weatherSlots'

/** The server flags this too; checked here as well so an old answer can't pass for current */
const STALE_AFTER_MS = 30 * 60_000

const sourceLabel: Record<string, string> = { kma: '기상청', demo: '데모 데이터' }

const clock = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <dt className="inline-flex items-center gap-1 text-muted">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

const show = (value: number | null, unit: string) => (value === null ? '정보 없음' : `${value}${unit}`)

function Slot({ slot, now }: { slot: WeatherSlot; now: number }) {
  const label = slotLabel(slot.time, now)
  const isCurrent = label === '지금'
  return (
    <li className={`rounded-xl border bg-surface p-3 ${isCurrent ? 'border-primary' : 'border-border'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <time dateTime={new Date(slot.time).toISOString()} className="text-xs text-muted tabular-nums">
          {clock(slot.time)}
        </time>
      </div>
      <p className="mb-2 text-[11px] text-muted">{slot.kind === 'observed' ? '실황' : '예보'}</p>
      <dl className="space-y-1">
        <Row icon={Thermometer} label="기온" value={show(slot.temp, '°C')} />
        <Row icon={Droplets} label="습도" value={show(slot.humidity, '%')} />
        {slot.kind === 'observed' ? (
          <Row icon={CloudRain} label="강수량" value={show(slot.precipitation, 'mm')} />
        ) : (
          <>
            <Row icon={Umbrella} label="강수확률" value={show(slot.precipitationProb, '%')} />
            <Row icon={Wind} label="초미세먼지" value={show(slot.pm25, 'µg/m³')} />
          </>
        )}
      </dl>
      {slot.pm25 !== null && (
        <div className="mt-1 text-right">
          <LevelBadge assessment={metricByKey.pm25.assess(slot.pm25)} />
        </div>
      )}
    </li>
  )
}

/** FR-02: weather for the two hours either side of now */
export function WeatherTimeline({ forecast }: { forecast: Forecast }) {
  const now = useNow()
  const slots = buildWeatherSlots(forecast, now)
  const peak = peakRainChance(slots, now)
  const updatedMs = forecast.updatedAt ? Date.parse(forecast.updatedAt) : null
  const stale = forecast.stale || (updatedMs !== null && now - updatedMs > STALE_AFTER_MS)
  const source = forecast.source && Object.hasOwn(sourceLabel, forecast.source) ? sourceLabel[forecast.source] : undefined

  return (
    <section aria-labelledby="weather-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="weather-heading" className="text-base font-semibold">
            전후 2시간 날씨
          </h2>
          {peak !== null && <p className="text-sm text-muted">앞으로 강수확률 최고 {peak}%</p>}
        </div>
        {(updatedMs !== null || source) && (
          <p className={`inline-flex items-center gap-1 text-xs ${stale ? 'font-medium text-fg' : 'text-muted'}`}>
            {stale && <Clock className="size-3.5 text-status-warning" aria-hidden />}
            {stale && '오래된 정보 · '}
            {source && `${source} · `}
            {updatedMs !== null && `${formatRelative(updatedMs, now)} 갱신`}
          </p>
        )}
      </div>

      {forecast.message && <p className="mb-3 rounded-lg bg-surface px-3 py-2 text-sm text-muted">{forecast.message}</p>}

      {slots.length > 0 ? (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {slots.map((slot) => (
            <Slot key={`${slot.kind}-${slot.time}`} slot={slot} now={now} />
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">
          표시할 날씨 정보가 없습니다.
        </p>
      )}
    </section>
  )
}

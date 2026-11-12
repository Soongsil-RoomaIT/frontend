import { Clock, CloudSun, Droplets, RefreshCw, Thermometer, Umbrella, Wind, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { Outdoor, OutdoorHour } from '@/api/types'
import { LevelBadge } from '@/features/monitoring/LevelBadge'
import { metricByKey } from '@/features/monitoring/metrics'
import { formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { outdoorSlots, peakRainChance, slotLabel } from './outdoorSlots'
import { useOutdoor } from './queries'

/** The server flags this too; checked here as well so an old answer can't pass for current */
const STALE_AFTER_MS = 3 * 60 * 60_000

const sourceLabel: Record<string, string> = { kma: '기상청', airkorea: '에어코리아', 'kma+airkorea': '기상청·에어코리아', demo: '데모 데이터' }
const clock = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const show = (value: number | null, unit: string) => (value === null ? '정보 없음' : `${value}${unit}`)

function Value({ icon: Icon, label, value, unit, grade }: { icon: LucideIcon; label: string; value: number | null; unit: string; grade?: 'pm25' | 'pm10' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="inline-flex items-center gap-1 text-xs text-muted">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${value === null ? 'text-muted' : ''}`}>
        {value === null ? '—' : value}
        {value !== null && <span className="ml-0.5 text-xs font-normal text-muted">{unit}</span>}
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {value === null ? '정보 없음' : grade ? <LevelBadge assessment={metricByKey[grade].assess(value)} /> : null}
      </div>
    </div>
  )
}

function Slot({ slot, now }: { slot: OutdoorHour; now: number }) {
  const time = Date.parse(slot.time)
  const label = slotLabel(time, now)
  const isCurrent = label === '지금'
  return (
    <li className={`rounded-xl border bg-surface p-3 ${isCurrent ? 'border-primary' : 'border-border'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <time dateTime={slot.time} className="text-xs text-muted tabular-nums">
          {clock(time)}
        </time>
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        {(
          [
            ['기온', slot.temp, '°C'],
            ['습도', slot.humidity, '%'],
            ['강수확률', slot.precipitationProb, '%'],
            ['초미세먼지', slot.pm25, 'µg/m³'],
          ] as const
        ).map(([name, value, unit]) => (
          <div key={name} className="flex items-center justify-between gap-2">
            <dt className="text-muted">{name}</dt>
            <dd className="font-medium tabular-nums">{show(value, unit)}</dd>
          </div>
        ))}
      </dl>
    </li>
  )
}

function Freshness({ outdoor, now }: { outdoor: Outdoor; now: number }) {
  const publishedMs = outdoor.publishedAt ? Date.parse(outdoor.publishedAt) : null
  const fetchedMs = outdoor.fetchedAt ? Date.parse(outdoor.fetchedAt) : null
  const stale = outdoor.stale || (fetchedMs !== null && now - fetchedMs > STALE_AFTER_MS)
  const source = outdoor.source && Object.hasOwn(sourceLabel, outdoor.source) ? sourceLabel[outdoor.source] : outdoor.source
  if (publishedMs === null && fetchedMs === null && !source) return null
  return (
    <p className={`inline-flex items-center gap-1 text-xs ${stale ? 'font-medium text-fg' : 'text-muted'}`}>
      {stale && <Clock className="size-3.5 text-status-warning" aria-hidden />}
      {stale && '오래된 정보 · '}
      {source && `${source} · `}
      {publishedMs !== null ? `${clock(publishedMs)} 발표` : fetchedMs !== null ? `${formatRelative(fetchedMs, now)} 조회` : ''}
    </p>
  )
}

function Retry({ refetch, isFetching }: { refetch: () => void; isFetching: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
      <span>외기 정보를 불러오지 못했습니다.</span>
      <button
        type="button"
        onClick={refetch}
        disabled={isFetching}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-bg disabled:opacity-50"
      >
        <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
        다시 시도
      </button>
    </div>
  )
}

/**
 * Outdoor weather and air quality (ADR-015: fine dust is judged from outside). The full card adds
 * the ±2h hourly values when the server provides them; the compact one is the dashboard summary.
 */
export function OutdoorCard({ compact = false }: { compact?: boolean }) {
  const { data, isPending, isError, refetch, isFetching } = useOutdoor()
  const now = useNow()

  return (
    <section aria-labelledby="outdoor-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="outdoor-heading" className="inline-flex items-center gap-1.5 text-base font-semibold">
          <CloudSun className="size-4 text-muted" aria-hidden />
          바깥 날씨·공기
        </h2>
        {compact ? (
          <Link to="/forecast" className="text-sm font-medium text-primary">
            예보 보기
          </Link>
        ) : (
          data && <Freshness outdoor={data} now={now} />
        )}
      </div>

      {isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : isError && !data ? (
        <Retry refetch={() => refetch()} isFetching={isFetching} />
      ) : data ? (
        <div className="space-y-3">
          {!compact && data.message && <p className="rounded-lg bg-surface px-3 py-2 text-sm text-muted">{data.message}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Value icon={Wind} label="초미세먼지" value={data.pm25} unit="µg/m³" grade="pm25" />
            <Value icon={Wind} label="미세먼지" value={data.pm10} unit="µg/m³" grade="pm10" />
            <Value icon={Umbrella} label="강수확률" value={data.precipitationProb} unit="%" />
            <Value icon={Thermometer} label="기온" value={data.temp} unit="°C" />
            <Value icon={Droplets} label="습도" value={data.humidity} unit="%" />
          </div>
          {compact && (
            <div className="text-xs">
              <Freshness outdoor={data} now={now} />
            </div>
          )}
          {!compact && <HourlyTimeline outdoor={data} now={now} />}
        </div>
      ) : null}
    </section>
  )
}

function HourlyTimeline({ outdoor, now }: { outdoor: Outdoor; now: number }) {
  const slots = outdoorSlots(outdoor, now)
  if (slots.length === 0) return null
  const peak = peakRainChance(slots, now)
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">전후 2시간</h3>
        {peak !== null && <p className="text-xs text-muted">앞으로 강수확률 최고 {peak}%</p>}
      </div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {slots.map((slot) => (
          <Slot key={slot.time} slot={slot} now={now} />
        ))}
      </ol>
    </div>
  )
}

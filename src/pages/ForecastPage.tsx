import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { useAutomationSettings } from '@/features/automation/queries'
import { DecisionCard } from '@/features/forecast/DecisionCard'
import { isPending, sortDecisions } from '@/features/forecast/decisions'
import { PendingDecisions } from '@/features/forecast/PendingDecisions'
import { useForecast } from '@/features/forecast/queries'
import { WeatherTimeline } from '@/features/forecast/WeatherTimeline'
import { useDevices } from '@/features/monitoring/queries'
import { useSystemStatus } from '@/features/monitoring/systemStatus'

const HISTORY_LIMIT = 10

export function ForecastPage() {
  const { data: forecast, isPending: loading, isError, isRefetchError, isFetching, refetch } = useForecast()
  const devices = useDevices()
  const status = useSystemStatus()
  const { data: settings } = useAutomationSettings()

  const history = sortDecisions((forecast?.decisions ?? []).filter((d) => !isPending(d))).slice(0, HISTORY_LIMIT)

  return (
    <>
      <PageHeader title="예보·추천" description="전후 2시간 날씨와 권장 동작을 확인합니다." />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : isError && !forecast ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <span>예보를 불러오지 못했습니다.</span>
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
        <div className="space-y-8">
          {isRefetchError && (
            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              최신 정보를 불러오지 못해 이전 정보를 표시하고 있습니다.
            </p>
          )}
          {settings && !settings.enabled && (
            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              자동제어가 꺼져 있어 새 추천이 만들어지지 않습니다.{' '}
              <Link to="/settings" className="font-medium text-primary">
                설정으로 이동
              </Link>
            </p>
          )}

          <PendingDecisions />
          <WeatherTimeline forecast={forecast} />

          <section aria-labelledby="decision-history-heading">
            <h2 id="decision-history-heading" className="mb-3 text-base font-semibold">
              최근 추천 기록
            </h2>
            {history.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {history.map((decision) => (
                  <DecisionCard
                    key={decision.id}
                    decision={decision}
                    devices={devices.data}
                    devicesLoading={devices.isPending}
                    status={status}
                    settings={settings}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">
                아직 처리된 추천이 없습니다.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  )
}

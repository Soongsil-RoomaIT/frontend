import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import type { SensorReading } from '@/api/types'
import { PageHeader } from '@/components/PageHeader'

const metrics: { key: keyof Omit<SensorReading, 'measuredAt'>; label: string; unit: string }[] = [
  { key: 'temperature', label: '온도', unit: '°C' },
  { key: 'humidity', label: '습도', unit: '%' },
  { key: 'co2', label: 'CO₂', unit: 'ppm' },
  { key: 'pm25', label: '초미세먼지', unit: 'µg/m³' },
  { key: 'pm10', label: '미세먼지', unit: 'µg/m³' },
]

export function DashboardPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['sensors', 'latest'],
    queryFn: api.getLatestSensors,
  })

  return (
    <>
      <PageHeader
        title="대시보드"
        description={
          data ? `마지막 측정 ${new Date(data.measuredAt).toLocaleTimeString('ko-KR')}` : '실내 환경 현황'
        }
      />

      {isError ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          센서 데이터를 불러오지 못했습니다.{' '}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>
            다시 시도
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map(({ key, label, unit }) => (
            <div key={key} className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {isPending ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-border" /> : data[key]}
                {!isPending && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

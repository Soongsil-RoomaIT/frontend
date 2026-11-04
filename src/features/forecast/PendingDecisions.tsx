import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useAutomationSettings } from '@/features/automation/queries'
import { useDevices } from '@/features/monitoring/queries'
import { useSystemStatus } from '@/features/monitoring/systemStatus'
import { DecisionCard } from './DecisionCard'
import { isPending, sortDecisions } from './decisions'
import { useForecast } from './queries'

/** Recommendations waiting for an answer. Renders nothing when there are none. */
export function PendingDecisions({ showLink = false }: { showLink?: boolean }) {
  const { data: forecast } = useForecast()
  const devices = useDevices()
  const status = useSystemStatus()
  const { data: settings } = useAutomationSettings()

  const pending = sortDecisions((forecast?.decisions ?? []).filter(isPending))
  if (pending.length === 0) return null

  return (
    <section aria-labelledby="pending-decisions-heading">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="pending-decisions-heading" className="text-base font-semibold">
          승인 대기 {pending.length}건
        </h2>
        {showLink && (
          <Link to="/forecast" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            예보·추천 <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {pending.map((decision) => (
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
    </section>
  )
}

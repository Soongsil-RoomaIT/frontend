import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { AutomationSettings, Decision, Device, Forecast } from '@/api/types'
import { showToast } from '@/stores/toasts'
import { decisionTitle, diffDecisions, reasonText } from './decisions'

const statusMap = (decisions: readonly Decision[]) => new Map(decisions.map((d) => [d.id, d.status as string]))

/**
 * Toasts for recommendations and their outcomes, from any screen. Watches the cached forecast,
 * so it doesn't matter how a change arrived. What's already there at first load stays quiet.
 */
export function startDecisionAlerts(queryClient: QueryClient) {
  let seen: Map<string, string> | null = null
  /** A re-read can briefly return an older status, which must not announce the result twice */
  const announced = new Set<string>()

  const check = (forecast: Forecast | undefined) => {
    if (!forecast) return
    if (seen === null) {
      seen = statusMap(forecast.decisions)
      return
    }
    const devices = queryClient.getQueryData<Device[]>(queryKeys.devices)
    const settings = queryClient.getQueryData<AutomationSettings>(queryKeys.automationSettings)
    for (const { kind, decision } of diffDecisions(seen, forecast.decisions)) {
      const title = decisionTitle(decision, devices)
      if (kind === 'proposed') {
        // In full-auto it's about to run by itself; the result is what's worth announcing
        if (settings?.enabled && settings.mode === 'AUTO') continue
        const first = decision.reasons?.[0]
        showToast({ tone: 'info', title: `새 추천: ${title}`, detail: first && reasonText(first) })
      } else if (!announced.has(decision.id)) {
        announced.add(decision.id)
        if (kind === 'executed') showToast({ tone: 'success', title: `${title} 실행 완료` })
        else showToast({ tone: 'error', title: `${title} 실행 실패`, detail: decision.reason })
      }
    }
    seen = statusMap(forecast.decisions)
  }

  check(queryClient.getQueryData<Forecast>(queryKeys.forecast))
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.query.queryKey[0] === queryKeys.forecast[0]) {
      check(event.query.state.data as Forecast | undefined)
    }
  })
}

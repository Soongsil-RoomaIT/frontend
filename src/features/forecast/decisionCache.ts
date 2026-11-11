import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { CommandAck, Decision, Forecast } from '@/api/types'

/** Puts one decision into the cached forecast. No-op until the forecast has loaded. */
export function upsertDecision(queryClient: QueryClient, decision: Decision) {
  queryClient.setQueryData<Forecast>(queryKeys.forecast, (forecast) => {
    if (!forecast) return forecast
    const known = forecast.decisions.some((d) => d.id === decision.id)
    return {
      ...forecast,
      decisions: known
        ? forecast.decisions.map((d) => (d.id === decision.id ? decision : d))
        : [decision, ...forecast.decisions],
    }
  })
}

/**
 * The command behind a decision finished. Applied right away because a server may only push
 * `command.ack` and not `decision.updated`; the caller re-reads the forecast for the final word.
 */
export function applyCommandResult(queryClient: QueryClient, ack: CommandAck) {
  const decision = queryClient
    .getQueryData<Forecast>(queryKeys.forecast)
    ?.decisions.find((d) => d.commandId === ack.commandId)
  if (decision) upsertDecision(queryClient, { ...decision, status: ack.status, reason: ack.reason ?? decision.reason })
}

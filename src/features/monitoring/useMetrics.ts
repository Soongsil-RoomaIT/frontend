import { useMemo } from 'react'
import { useComfortStore } from '@/stores/comfort'
import { createMetrics, indexMetrics } from './metrics'

/** Metric definitions with this user's comfort ranges applied */
export function useMetrics() {
  const comfort = useComfortStore((s) => s.comfort)
  return useMemo(() => {
    const metrics = createMetrics(comfort)
    return { metrics, metricByKey: indexMetrics(metrics) }
  }, [comfort])
}

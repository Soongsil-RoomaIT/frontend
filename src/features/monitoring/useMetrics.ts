import { useMemo } from 'react'
import { useComfortStore } from '@/stores/comfort'
import { createMetrics, indexMetrics, isVisibleMetric } from './metrics'

/** Metric definitions with this user's comfort ranges applied. `metrics` lists only visible ones. */
export function useMetrics() {
  const comfort = useComfortStore((s) => s.comfort)
  return useMemo(() => {
    const metrics = createMetrics(comfort)
    return { metrics: metrics.filter((m) => isVisibleMetric(m.key)), metricByKey: indexMetrics(metrics) }
  }, [comfort])
}

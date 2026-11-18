import type { Prediction, PredictionMetric } from '@/api/types'

/** Whether the model earns the right to drive control: strictly better than "same as now" */
export const modelBeatsBaseline = (m: PredictionMetric): boolean | null =>
  m.mae === null || m.baselineMae === null ? null : m.mae < m.baselineMae

export type ModelQuality = 'better' | 'worse' | 'unknown'

/** One verdict for the card header: better than baseline only if every scored metric is */
export function modelQuality(prediction: Prediction): ModelQuality {
  const verdicts = prediction.metrics.map(modelBeatsBaseline).filter((v) => v !== null)
  if (verdicts.length === 0) return 'unknown'
  return verdicts.every(Boolean) ? 'better' : 'worse'
}

/** Prediction-based control: the server's flag when given, else inferred from the model quality */
export function controlActive(prediction: Prediction): boolean | null {
  if (prediction.controlEnabled !== null) return prediction.controlEnabled
  const quality = modelQuality(prediction)
  return quality === 'unknown' ? null : quality === 'better'
}

export const hasPrediction = (prediction: Prediction) => prediction.metrics.some((m) => m.predicted !== null)

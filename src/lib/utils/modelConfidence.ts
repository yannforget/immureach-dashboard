import { parseCsv } from '@/lib/utils/csv'
import type { MetricKey } from '@/types'

export type ConfidenceLevel = 'high' | 'good' | 'moderate' | 'low'

export interface ModelConfidence {
  r2: number
  level: ConfidenceLevel
}

// Model validation R² per vaccine (confidence_metrics.csv). The `vr` column
// names the model's outcome; penta_uptake has no card (only its 0-dose
// counterpart is shown), so it is deliberately left unmapped and dropped.
const VR_TO_METRIC: Record<string, MetricKey> = {
  bcg_uptake: 'pred_bcg',
  pcv_uptake: 'pred_pcv',
  polio_uptake: 'pred_polio',
  rota_uptake: 'pred_rota',
  vaa_uptake: 'pred_vaa',
  var_uptake: 'pred_var',
}

// Non-universal scale given by the modelling team:
// R² > 0.9 high, > 0.75 good, > 0.5 moderate, otherwise low.
export function getConfidenceLevel(r2: number): ConfidenceLevel {
  if (r2 > 0.9) return 'high'
  if (r2 > 0.75) return 'good'
  if (r2 > 0.5) return 'moderate'
  return 'low'
}

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: 'élevée',
  good: 'bonne',
  moderate: 'modérée',
  low: 'faible',
}

export const CONFIDENCE_BADGE_CLASSES: Record<ConfidenceLevel, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  good: 'bg-teal-100 text-teal-800',
  moderate: 'bg-amber-100 text-amber-800',
  low: 'bg-rose-100 text-rose-800',
}

export function parseConfidenceMetricsCsv(text: string): Partial<Record<MetricKey, ModelConfidence>> {
  const result: Partial<Record<MetricKey, ModelConfidence>> = {}
  parseCsv(text).forEach(r => {
    const metricKey = VR_TO_METRIC[r.vr]
    const r2 = Number(r.mean_r2)
    if (!metricKey || !Number.isFinite(r2)) return
    result[metricKey] = { r2, level: getConfidenceLevel(r2) }
  })
  return result
}

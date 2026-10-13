import type { MetricsResponse } from '@/api/client'

/** Minimum CV ROC-AUC gap (below the overall target) for a vessel to be called weaker. */
export const WEAKER_GAP = 0.05

export interface WeakerTarget {
  id: string
  label: string
  auc: number
}

/** Vessel targets whose CV ROC-AUC is at least WEAKER_GAP below the overall target's, ascending. */
export function weakerTargets(m: MetricsResponse): WeakerTarget[] {
  const entries = Object.entries(m.targets)
  const overall = entries.find(([, t]) => t.role === 'overall')
  if (!overall) return []
  const ref = overall[1].cv.default.roc_auc.mean
  return entries
    .filter(([, t]) => t.role === 'vessel')
    .map(([id, t]) => ({ id, label: t.label, auc: t.cv.default.roc_auc.mean }))
    .filter((t) => ref - t.auc >= WEAKER_GAP)
    .sort((a, b) => a.auc - b.auc)
}

/** Largest cross-fold spread of a tuned decision threshold. */
export const maxThresholdStd = (m: MetricsResponse): number =>
  Math.max(0, ...Object.values(m.targets).map((t) => t.threshold.cv_std))

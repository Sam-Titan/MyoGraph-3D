import type { MetricsResponse } from '@/api/client'
import type { components } from '@/api/schema'
import { ordinal } from '@/lib/format'

type Schemas = components['schemas']
export type TargetMetrics = Schemas['TargetMetrics']
export type StabilityStat = Schemas['StabilityStat']

export type ThresholdMode = 'tuned' | 'default'

export const METRICS = [
  { key: 'roc_auc', label: 'ROC-AUC', thresholdFree: true },
  { key: 'brier', label: 'Brier', thresholdFree: true },
  { key: 'accuracy', label: 'Accuracy', thresholdFree: false },
  { key: 'precision', label: 'Precision', thresholdFree: false },
  { key: 'recall', label: 'Recall', thresholdFree: false },
  { key: 'f1', label: 'F1', thresholdFree: false },
] as const

export type MetricKey = (typeof METRICS)[number]['key']

/** Targets in API order. Colour is assigned by position so no target id is ever hard-coded. */
export const targetIds = (m: MetricsResponse): string[] => Object.keys(m.targets)

export const targetColor = (index: number): string => `var(--target-${(index % 4) + 1})`

export interface MetricCell {
  key: MetricKey
  label: string
  cvMean: number
  cvStd: number
  holdout: number
}

export interface MetricRow {
  id: string
  label: string
  color: string
  threshold: number
  prevalence: { train: number; test: number }
  majority: { train: number; test: number }
  cells: MetricCell[]
}

const majority = (p: number): number => Math.max(p, 1 - p)

export function metricRows(m: MetricsResponse, mode: ThresholdMode): MetricRow[] {
  return targetIds(m).map((id, i) => {
    const t = m.targets[id]
    return {
      id,
      label: t.label,
      color: targetColor(i),
      threshold: mode === 'tuned' ? t.threshold.tuned : t.threshold.default,
      prevalence: t.prevalence,
      majority: { train: majority(t.prevalence.train), test: majority(t.prevalence.test) },
      cells: METRICS.map(({ key, label }) => ({
        key,
        label,
        cvMean: t.cv[mode][key].mean,
        cvStd: t.cv[mode][key].std,
        holdout: t.test[mode][key],
      })),
    }
  })
}

// --- split stability --------------------------------------------------------------------------

export interface StabilityRow {
  id: string
  label: string
  color: string
  stat: StabilityStat
  /** Number of splits including the official one. */
  total: number
  /** 1 = official value is the lowest of all splits. */
  rankFromLowest: number
}

export function stabilityRows(m: MetricsResponse): StabilityRow[] {
  return targetIds(m).flatMap((id, i) => {
    const stat = m.stability.targets[id]?.roc_auc
    if (!stat) return []
    const below = stat.values.filter((v) => v < stat.official).length
    return [
      {
        id,
        label: m.targets[id].label,
        color: targetColor(i),
        stat,
        total: stat.values.length + 1,
        rankFromLowest: below + 1,
      },
    ]
  })
}

/** Plain sentence stating where the official split falls among all splits. */
export function stabilitySentence(r: StabilityRow): string {
  const { rankFromLowest: rank, total } = r
  const where =
    rank === 1
      ? `the lowest of the ${total} splits`
      : rank === total
        ? `the highest of the ${total} splits`
        : rank <= total / 2
          ? `the ${ordinal(rank)}-lowest of the ${total} splits`
          : `the ${ordinal(total - rank + 1)}-highest of the ${total} splits`
  return `${r.label}: the official hold-out is ${where}.`
}

// --- ROC --------------------------------------------------------------------------------------

/** Linear interpolation of a monotone-x curve at x. */
function interpolate(xs: number[], ys: number[], x: number): number {
  const j = xs.findIndex((v) => v >= x)
  if (j <= 0) return ys[0] ?? 0
  const [x0, x1, y0, y1] = [xs[j - 1], xs[j], ys[j - 1], ys[j]]
  return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
}

export interface RocData {
  points: Record<string, number>[]
  series: { id: string; label: string; color: string; auc: number }[]
}

/** All hold-out ROC curves on one shared fpr grid (keys: `fpr`, `chance`, then one per target id). */
export function rocData(m: MetricsResponse): RocData {
  const ids = targetIds(m)
  const grid = [...new Set(ids.flatMap((id) => m.targets[id].roc_test.fpr))].sort((a, b) => a - b)
  const points = grid.map((x) => {
    const row: Record<string, number> = { fpr: x, chance: x }
    for (const id of ids) {
      const { fpr, tpr } = m.targets[id].roc_test
      row[id] = interpolate(fpr, tpr, x)
    }
    return row
  })
  const series = ids.map((id, i) => ({
    id,
    label: m.targets[id].label,
    color: targetColor(i),
    auc: m.targets[id].test.default.roc_auc,
  }))
  return { points, series }
}

// --- calibration ------------------------------------------------------------------------------

export interface CalibrationPoint {
  predicted: number
  observed: number
  ideal: number
  n: number
}

export function calibrationPoints(t: TargetMetrics): CalibrationPoint[] {
  return t.calibration_bins
    .map((b) => ({
      predicted: b.mean_predicted,
      observed: b.fraction_positive,
      ideal: b.mean_predicted,
      n: b.n,
    }))
    .sort((a, b) => a.predicted - b.predicted)
}

// --- confusion --------------------------------------------------------------------------------

export interface ConfusionTile {
  actual: 'Negative' | 'Positive'
  predicted: 'Negative' | 'Positive'
  count: number
  rowShare: number
}

/** Row-major 2x2: actual negative (TN, FP) then actual positive (FN, TP). */
export function confusionTiles(c: {
  tp: number
  fp: number
  tn: number
  fn: number
}): ConfusionTile[] {
  const neg = c.tn + c.fp
  const pos = c.fn + c.tp
  const share = (n: number, d: number) => (d > 0 ? n / d : 0)
  return [
    { actual: 'Negative', predicted: 'Negative', count: c.tn, rowShare: share(c.tn, neg) },
    { actual: 'Negative', predicted: 'Positive', count: c.fp, rowShare: share(c.fp, neg) },
    { actual: 'Positive', predicted: 'Negative', count: c.fn, rowShare: share(c.fn, pos) },
    { actual: 'Positive', predicted: 'Positive', count: c.tp, rowShare: share(c.tp, pos) },
  ]
}

// --- importance -------------------------------------------------------------------------------

export const TOP_N = 15

export const topImportance = (m: MetricsResponse, target: string) =>
  [...(m.feature_importance[target] ?? [])]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, TOP_N)

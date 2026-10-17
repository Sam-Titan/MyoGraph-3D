import type { DisplayConfig, MetricsResponse, TargetInfo } from '@/api/client'
import { fillText } from './template'

/** Whole-dataset size (train + hold-out), for "{n_total} patients". */
export const totalPatients = (m: MetricsResponse): number => m.split.n_train + m.split.n_test

/** Share of ALL dataset patients with this target's outcome, as a whole number per 100. */
export function datasetPrevalence(m: MetricsResponse, id: string): number {
  const t = m.targets[id]
  if (!t) return 0
  const { n_train: nTrain, n_test: nTest } = m.split
  const p = (t.prevalence.train * nTrain + t.prevalence.test * nTest) / (nTrain + nTest)
  return Math.round(p * 100)
}

/** "Everyone was referred for angiography" note: this target's own outcome and prevalence. */
export function baseRateLines(
  display: DisplayConfig,
  m: MetricsResponse,
  target: TargetInfo,
): [string, string] {
  const line1 = fillText(display.base_rate_note.line1, {
    n_total: totalPatients(m),
    prev: datasetPrevalence(m, target.id),
    outcome: target.outcome_phrase,
  })
  return [line1, display.base_rate_note.line2]
}

const whole = (x: number): number => Math.round(x * 100)
const two = (x: number): string => x.toFixed(2)

export interface MetricLine {
  key: string
  text: string
}

/**
 * One plain sentence per metric, from the hold-out numbers of `id` in `mode` (the tuned or default
 * cut-off the table is showing). Brier's reference is the score of always giving the average share.
 */
export function metricLines(
  display: DisplayConfig,
  m: MetricsResponse,
  target: TargetInfo,
  mode: 'tuned' | 'default',
): MetricLine[] {
  const t = m.targets[target.id]
  if (!t) return []
  const h = t.test[mode]
  const prev = t.prevalence.test
  const outcome = target.outcome_phrase
  const p = display.performance
  return [
    { key: 'roc_auc', text: rocAucLine(display, m, target) },
    {
      key: 'brier',
      text: fillText(p.brier, {
        value: two(h.brier),
        prev: `${whole(prev)}%`,
        ref: two(prev * (1 - prev)),
      }),
    },
    {
      key: 'accuracy',
      text: fillText(p.accuracy, {
        value: two(h.accuracy),
        v100: whole(h.accuracy),
        majority: whole(Math.max(prev, 1 - prev)),
      }),
    },
    {
      key: 'precision',
      text: fillText(p.precision, { value: two(h.precision), v100: whole(h.precision), outcome }),
    },
    {
      key: 'recall',
      text: fillText(p.recall, { value: two(h.recall), v100: whole(h.recall), outcome }),
    },
    { key: 'f1', text: fillText(p.f1, { value: two(h.f1) }) },
  ]
}

/** The ROC-AUC sentence for one target: cross-validated first, hold-out second. */
export function rocAucLine(display: DisplayConfig, m: MetricsResponse, target: TargetInfo): string {
  const t = m.targets[target.id]
  if (!t) return ''
  return fillText(display.performance.roc_auc, {
    outcome: target.outcome_phrase,
    cv: whole(t.cv.default.roc_auc.mean),
    holdout: whole(t.test.default.roc_auc),
  })
}

export interface TrustRow {
  id: string
  reliable: boolean
  text: string
}

/** One line per target: reliability tier from its cross-validated ROC-AUC and its Uncertain share. */
export function trustRows(display: DisplayConfig, m: MetricsResponse): TrustRow[] {
  const { trust } = display
  return Object.entries(m.targets).flatMap(([id, t]) => {
    const u = m.uncertainty.targets[id]
    if (!u) return [] // never state a share we do not have
    const auc = t.cv.default.roc_auc.mean
    const reliable = auc >= trust.reliable_min_auc
    return [
      {
        id,
        reliable,
        text: fillText(reliable ? trust.reliable : trust.weak, {
          id,
          label: t.label,
          auc: two(auc),
          n_unc: u.n_uncertain,
          n: u.n,
        }),
      },
    ]
  })
}

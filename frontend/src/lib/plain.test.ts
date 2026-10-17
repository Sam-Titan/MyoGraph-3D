import { describe, expect, it } from 'vitest'
import type { DisplayConfig, MetricsResponse, TargetInfo } from '@/api/client'
import { baseRateLines, datasetPrevalence, metricLines, trustRows } from './plain'

const metrics = {
  split: { n_train: 242, n_test: 61 },
  targets: {
    CAD: {
      label: 'Overall CAD',
      prevalence: { train: 0.71, test: 0.72 },
      cv: { default: { roc_auc: { mean: 0.93, std: 0.02 } } },
      test: {
        default: { roc_auc: 0.82 },
        tuned: { brier: 0.17, accuracy: 0.74, precision: 0.85, recall: 0.77, f1: 0.81 },
      },
    },
    RCA: {
      label: 'RCA stenosis',
      prevalence: { train: 0.38, test: 0.36 },
      cv: { default: { roc_auc: { mean: 0.7, std: 0.05 } } },
      test: {
        default: { roc_auc: 0.69 },
        tuned: { brier: 0.2, accuracy: 0.72, precision: 0.65, recall: 0.5, f1: 0.56 },
      },
    },
  },
  uncertainty: {
    targets: { CAD: { n_uncertain: 17, n: 61 }, RCA: { n_uncertain: 38, n: 61 } },
  },
} as unknown as MetricsResponse

const display = {
  base_rate_note: {
    line1: '{n_total} patients, {prev} in 100 had {outcome}.',
    line2: 'Not your risk.',
  },
  performance: {
    roc_auc: 'ROC {cv}/{holdout} for {outcome}',
    brier: 'Brier {value} vs {ref} at {prev}',
    accuracy: 'Acc {value} {v100} {majority}',
    precision: 'Prec {value} {v100} {outcome}',
    recall: 'Rec {value} {v100} {outcome}',
    f1: 'F1 {value}',
  },
  trust: {
    reliable_min_auc: 0.8,
    reliable: '{id} {label} ok {auc} {n_unc}/{n}',
    weak: '{id} {label} weak {auc} {n_unc}/{n}',
  },
} as unknown as DisplayConfig

const target = (id: string, outcome: string) => ({ id, outcome_phrase: outcome }) as TargetInfo

describe('plain wording numbers', () => {
  it('uses the dataset prevalence of the chosen target, not CAD', () => {
    expect(datasetPrevalence(metrics, 'CAD')).toBe(71)
    expect(datasetPrevalence(metrics, 'RCA')).toBe(38)
    const [line] = baseRateLines(
      display,
      metrics,
      target('RCA', 'a narrowing in the RCA, the right coronary artery'),
    )
    expect(line).toBe(
      '303 patients, 38 in 100 had a narrowing in the RCA, the right coronary artery.',
    )
  })

  it('fills metric sentences from the hold-out numbers', () => {
    const lines = Object.fromEntries(
      metricLines(display, metrics, target('CAD', 'CAD'), 'tuned').map((l) => [l.key, l.text]),
    )
    expect(lines.roc_auc).toBeUndefined() // lives in the headline strip only
    expect(lines.accuracy).toBe('Acc 0.74 74 72')
    expect(lines.recall).toBe('Rec 0.77 77 CAD')
    expect(lines.brier).toBe('Brier 0.17 vs 0.20 at 72%')
  })

  it('splits reliable from weak by cross-validated ROC-AUC and shows the Uncertain share', () => {
    const rows = trustRows(display, metrics)
    expect(rows.map((r) => [r.id, r.reliable])).toEqual([
      ['CAD', true],
      ['RCA', false],
    ])
    expect(rows[1].text).toBe('RCA RCA stenosis weak 0.70 38/61')
  })
})

import { describe, expect, it } from 'vitest'
import type { BenchCell, BenchmarkResponse } from '@/api/client'
import { ablationTakeaways, comparisonTakeaways, makeScale } from './benchmarkModel'

const test = (mean: number, within: boolean) => ({
  mean_diff: mean,
  std_diff: 0.02,
  ci_lo: mean - 0.03,
  ci_hi: mean + 0.03,
  p: within ? 0.4 : 0.01,
  within_noise: within,
})
const cell = (auc: number, diff: number, within: boolean): BenchCell =>
  ({
    cv: { roc_auc: { mean: auc, std: 0.04 } },
    holdout: { roc_auc: auc, brier: 0.2, recall: 0.7 },
    vs_reference: { roc_auc: test(diff, within), brier: test(0, true), recall: test(0, true) },
  }) as BenchCell

const b = {
  reference_model: 'xgb',
  protocol: { confidence_level: 0.95, n_train: 242 },
  models: [
    { id: 'lr', label: 'Logistic regression', status: 'ok', note: '' },
    { id: 'xgb', label: 'XGBoost', status: 'ok', note: '' },
    { id: 'tabpfn', label: 'TabPFN', status: 'skipped', note: '' },
  ],
  feature_sets: [
    { id: 'all', label: 'All features' },
    { id: 'no_ecg', label: 'Without ECG' },
  ],
  comparison: {
    CAD: { lr: cell(0.9, -0.02, true), xgb: cell(0.92, 0, true) },
    LAD: { lr: cell(0.8, 0.05, false), xgb: cell(0.75, 0, true) },
  },
  ablation: {
    CAD: { all: cell(0.92, 0, true), no_ecg: cell(0.91, -0.01, true) },
    LAD: { all: cell(0.75, 0, true), no_ecg: cell(0.7, -0.05, false) },
  },
} as unknown as BenchmarkResponse

describe('benchmark takeaways', () => {
  it('says plainly when a gap is within the noise, and when it is not', () => {
    const t = comparisonTakeaways(b)
    expect(t.lines[0].text).toBe(
      'no model is clearly different from XGBoost: logistic regression 0.02 lower, all within the noise.',
    )
    expect(t.lines[1].text).toBe(
      'logistic regression 0.05 higher than XGBoost in ROC-AUC, a gap larger than the noise.',
    )
    expect(t.intro).toContain('1 ROC-AUC gap is larger than the noise')
    expect(t.intro).toContain('242 training patients')
  })

  it('skips models without a result (TabPFN not installed)', () => {
    expect(JSON.stringify(comparisonTakeaways(b))).not.toContain('TabPFN')
  })

  it('describes ablation changes with the noise verdict', () => {
    const t = ablationTakeaways(b)
    expect(t.lines[0].text).toBe('without ECG, ROC-AUC 0.01 lower (within the noise).')
    expect(t.lines[1].text).toBe('without ECG, ROC-AUC 0.05 lower (larger than the noise).')
    expect(t.intro).toContain('1 of 2 cases')
  })

  it('scale puts the lowest whisker end at 0%', () => {
    const rows = [{ id: 'x', label: 'x', cell: cell(0.9, 0, true), isReference: false }]
    const s = makeScale(rows)
    expect(s.at(s.lo)).toBe('0%')
    expect(s.at(s.hi)).toBe('100%')
  })
})

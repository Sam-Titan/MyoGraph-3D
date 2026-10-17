import type { BenchCell, BenchmarkResponse } from '@/api/client'
import { fixed, joinList } from '@/lib/format'

export interface Row {
  id: string
  label: string
  cell: BenchCell
  isReference: boolean
}

/** Rows of one target's table, in config order. Skipped models (e.g. TabPFN) have no cell. */
export function comparisonRows(b: BenchmarkResponse, target: string): Row[] {
  return b.models.flatMap((m) => {
    const cell = b.comparison[target]?.[m.id]
    return cell ? [{ id: m.id, label: m.label, cell, isReference: m.id === b.reference_model }] : []
  })
}

/** Rows of one target's ablation table; the first feature set is the baseline. */
export function ablationRows(b: BenchmarkResponse, target: string): Row[] {
  return b.feature_sets.flatMap((s, i) => {
    const cell = b.ablation[target]?.[s.id]
    return cell ? [{ id: s.id, label: s.label, cell, isReference: i === 0 }] : []
  })
}

/** Lower-case the first word unless it is an acronym ("TabPFN", "ECG"). */
const lcFirst = (s: string): string => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)

/** Signed gap for tables: "+0.03", "−0.02", and plain "0.00" instead of "−0.00". */
export const signedGap = (d: number): string => {
  const v = fixed(Math.abs(d))
  return v === '0.00' ? v : `${d > 0 ? '+' : '−'}${v}`
}

/** "0.03 higher" / "0.02 lower" / "no different" (to two decimals). */
const gap = (d: number): string => {
  const v = fixed(Math.abs(d))
  return v === '0.00' ? 'about the same' : `${v} ${d > 0 ? 'higher' : 'lower'}`
}

const noise = (within: boolean): string => (within ? 'within the noise' : 'larger than the noise')

export interface Takeaways {
  intro: string
  lines: { target: string; text: string }[]
}

/**
 * Which model? One sentence per target from the paired ROC-AUC differences against the reference
 * model. "Within the noise" means the corrected confidence interval contains 0.
 */
export function comparisonTakeaways(b: BenchmarkResponse): Takeaways {
  const refLabel = b.models.find((m) => m.id === b.reference_model)?.label ?? b.reference_model
  let compared = 0
  let clear = 0
  const lines = Object.keys(b.comparison).map((target) => {
    const others = comparisonRows(b, target).filter((r) => !r.isReference)
    compared += others.length
    const bigger = others.filter((r) => !r.cell.vs_reference.roc_auc.within_noise)
    clear += bigger.length
    const parts = (rows: Row[]) =>
      rows.map((r) => `${lcFirst(r.label)} ${gap(r.cell.vs_reference.roc_auc.mean_diff)}`)
    if (bigger.length === 0) {
      return {
        target,
        text: `no model is clearly different from ${refLabel}: ${joinList(parts(others))}, all within the noise.`,
      }
    }
    const rest = others.filter((r) => r.cell.vs_reference.roc_auc.within_noise)
    return {
      target,
      text: `${joinList(parts(bigger))} than ${refLabel} in ROC-AUC, a gap ${noise(false)}${
        rest.length ? `; ${joinList(parts(rest))}, within the noise` : ''
      }.`,
    }
  })
  const level = Math.round(b.protocol.confidence_level * 100)
  const intro =
    clear === 0
      ? `Across ${compared} comparisons, no gap in ROC-AUC is larger than the noise, so the data cannot say which model is best.`
      : `Across ${compared} comparisons, ${clear} ROC-AUC gap${clear > 1 ? 's are' : ' is'} larger than the noise (the ${level}% interval excludes 0). With this many comparisons and only ${b.protocol.n_train} training patients, a gap or two can appear by chance, so read them as hints, not rankings.`
  return { intro, lines }
}

/**
 * How much does the model lean on test results? One sentence per target: for each feature set
 * without a group, the ROC-AUC change against all features and whether it exceeds the noise.
 */
export function ablationTakeaways(b: BenchmarkResponse): Takeaways {
  let dropped = 0
  let clear = 0
  const lines = Object.keys(b.ablation).map((target) => {
    const rows = ablationRows(b, target).filter((r) => !r.isReference)
    const parts = rows.map((r) => {
      const t = r.cell.vs_reference.roc_auc
      dropped += 1
      if (!t.within_noise) clear += 1
      return `${lcFirst(r.label)}, ROC-AUC ${gap(t.mean_diff)} (${noise(t.within_noise)})`
    })
    return { target, text: `${parts.join('; ')}.` }
  })
  const intro =
    clear === 0
      ? 'Removing the ECG and echo results changes ROC-AUC by less than the noise for every target, so these data do not show the model leaning on them.'
      : `Removing test results changes ROC-AUC by more than the noise in ${clear} of ${dropped} cases. Where the gap is within the noise, the model may still use those results; there are too few patients to tell.`
  return { intro, lines }
}

/** Shared axis for the whiskers of one table: mean ± std of the CV ROC-AUC. */
export function makeScale(rows: Row[]): { at: (v: number) => string; lo: number; hi: number } {
  const vals = rows.flatMap((r) => [
    r.cell.cv.roc_auc.mean - r.cell.cv.roc_auc.std,
    r.cell.cv.roc_auc.mean + r.cell.cv.roc_auc.std,
  ])
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 0.01) * 20) / 20)
  const hi = Math.min(1, Math.ceil((Math.max(...vals) + 0.01) * 20) / 20)
  return { at: (v) => `${((v - lo) / (hi - lo)) * 100}%`, lo, hi }
}

import type { MetricsResponse } from '@/api/client'
import { joinList, pct } from '@/lib/format'

/** Validation protocol. Every figure is read from the API; the rest is fixed method prose. */
export function ProtocolBox({ metrics }: { metrics: MetricsResponse }) {
  const { split, cv, excluded_inputs } = metrics
  const total = split.n_train + split.n_test
  return (
    <section aria-label="Validation protocol" className="min-w-0 rounded-xl border bg-card p-4">
      <h3 className="label-caps">Validation protocol</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          Stratified {pct(1 - split.test_size)}/{pct(split.test_size)} hold-out (seed {split.seed};{' '}
          {split.n_test} of {total} patients held out), stratified on number of stenotic vessels.
        </li>
        <li>
          {cv.n_splits}×{cv.n_repeats} repeated stratified cross-validation on the training set
          only.
        </li>
        <li>Platt calibration on out-of-fold margins.</li>
        <li>Decision thresholds chosen by Youden’s J on training out-of-fold predictions only.</li>
        <li>The hold-out set is never used for any modelling choice.</li>
        <li>{joinList(excluded_inputs)} are excluded from the inputs of every model.</li>
        <li>Presets in the workspace are hold-out patients.</li>
      </ul>
    </section>
  )
}

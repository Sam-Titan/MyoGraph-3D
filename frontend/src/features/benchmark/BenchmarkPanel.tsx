import type { BenchmarkResponse } from '@/api/client'
import { useBenchmark, useMetrics } from '@/api/queries'
import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { targetColor, targetIds } from '@/features/performance/performanceModel'
import { Section } from '@/features/performance/Section'
import { BenchTable } from './BenchTable'
import {
  ablationRows,
  ablationTakeaways,
  comparisonRows,
  comparisonTakeaways,
  type Takeaways,
} from './benchmarkModel'

function TakeawayList({ t }: { t: Takeaways }) {
  return (
    <div className="space-y-1 text-sm" data-testid="takeaway">
      <p>{t.intro}</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {t.lines.map((l) => (
          <li key={l.target}>
            <span className="num font-semibold">{l.target}</span>: {l.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Body({ b }: { b: BenchmarkResponse }) {
  const metrics = useMetrics().data
  const labels = Object.fromEntries(
    Object.entries(metrics?.targets ?? {}).map(([id, t]) => [id, t.label]),
  )
  const ids = metrics ? targetIds(metrics) : Object.keys(b.comparison)
  const ref = b.models.find((m) => m.id === b.reference_model)?.label ?? b.reference_model
  const skipped = b.models.filter((m) => m.status === 'skipped')
  const p = b.protocol

  return (
    <>
      <Section
        title="How the comparison is run"
        caption={`${p.n_train} training patients, ${p.n_test} held out. Every model gets exactly the same rules.`}
      >
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          <li>
            Same split and the same {p.cv}: {p.n_folds} folds per model.
          </li>
          <li>
            {p.calibration}; cut-off from {p.threshold}.
          </li>
          <li>
            Differences are paired per fold. A gap is a “clear difference” only if its{' '}
            {Math.round(p.confidence_level * 100)}% interval ({p.paired_test}, which allows for the
            folds sharing patients) excludes 0 <em>and</em> its p-value, adjusted for multiple
            comparisons, is below {(1 - p.confidence_level).toFixed(2)}. {p.multiplicity}.
          </li>
          <li>
            Hold-out ROC-AUC is shown for reference only. It rests on {p.n_test} patients and was
            not used to choose or rank anything.
          </li>
          {skipped.map((m) => (
            <li key={m.id}>
              {m.label} was not run: {m.note}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Is XGBoost the right model?"
        caption={`ROC-AUC (higher is better) for each model on the same patients; ◆ is ${ref}.`}
      >
        <TakeawayList t={comparisonTakeaways(b)} />
        <div className="space-y-5">
          {ids.map((id, i) => (
            <BenchTable
              key={id}
              targetId={id}
              targetLabel={labels[id] ?? id}
              color={targetColor(i)}
              rows={comparisonRows(b, id)}
              versus={`vs ${ref}`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Brier: lower is better. Recall is at each fold’s own tuned cut-off. [low, high] is the
          corrected interval of the paired ROC-AUC gap; adj. p is adjusted for multiple comparisons.
        </p>
      </Section>

      <Section
        title="How much does the model lean on ECG and echo results?"
        caption={`${ref} refit on the same folds with whole groups of inputs removed.`}
      >
        <TakeawayList t={ablationTakeaways(b)} />
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {b.feature_sets.map((s) => (
            <li key={s.id}>
              {s.label}: {s.n_columns} model columns
              {s.drop_groups.length > 0 && ` (drops ${s.drop_groups.join(' and ')})`}
            </li>
          ))}
        </ul>
        <div className="space-y-5">
          {ids.map((id, i) => (
            <BenchTable
              key={id}
              targetId={id}
              targetLabel={labels[id] ?? id}
              color={targetColor(i)}
              rows={ablationRows(b, id)}
              versus="vs all features"
            />
          ))}
        </div>
      </Section>
    </>
  )
}

/** Precomputed benchmark and ablation (`make benchmark`); the API only serves the file. */
export function BenchmarkPanel() {
  const benchmark = useBenchmark()
  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-4 p-(--gutter)">
      <h2 className="text-xl font-semibold tracking-tight">Benchmark and ablation</h2>
      <QueryBoundary query={benchmark} what="the benchmark">
        {(b) => <Body b={b} />}
      </QueryBoundary>
    </div>
  )
}

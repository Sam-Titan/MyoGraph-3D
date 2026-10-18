import { useState } from 'react'
import type { MetricsResponse } from '@/api/client'
import { useDisplay } from '@/api/queries'
import { GlossaryText } from '@/components/GlossaryText'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { fixed, pct, pm } from '@/lib/format'
import { metricLines } from '@/lib/plain'
import { fillText } from '@/lib/template'
import { METRICS, metricRows, type ThresholdMode } from './performanceModel'
import { Section } from './Section'
import { usePlainTargets } from './usePlainTargets'

const TH = 'px-2 py-2 text-left align-bottom font-medium'

export function MetricTable({ metrics }: { metrics: MetricsResponse }) {
  const [tuned, setTuned] = useState(true)
  const { data: display } = useDisplay()
  const targets = usePlainTargets()
  const mode: ThresholdMode = tuned ? 'tuned' : 'default'
  const rows = metricRows(metrics, mode)
  const example = rows[0]?.id
  const exampleTarget = example ? targets[example] : undefined
  const defaultThreshold = fixed(Object.values(metrics.targets)[0]?.threshold.default ?? 0.5)

  return (
    <Section
      title="Per-target metrics"
      caption="Top line is the cross-validated mean ± std on the training set; the grey line is the single hold-out value."
      aside={
        <div className="flex items-center gap-2">
          <Label htmlFor="threshold-mode" className="text-xs">
            Decision cut-off: {tuned ? 'tuned' : defaultThreshold}
          </Label>
          <Switch id="threshold-mode" checked={tuned} onCheckedChange={setTuned} />
        </div>
      }
    >
      <div className="max-w-full overflow-x-auto">
        {/* Below sm each target is a stacked card: ten columns do not fit a phone. */}
        <table className="w-full min-w-[56rem] text-sm max-sm:block max-sm:min-w-0">
          <thead className="border-b text-xs text-muted-foreground max-sm:hidden">
            <tr>
              <th className={TH}>Target</th>
              <th className={TH}>Cut-off</th>
              {METRICS.map((m) => (
                <th key={m.key} className={TH}>
                  {m.label}
                </th>
              ))}
              <th className={TH}>Prevalence</th>
              <th className={TH}>Majority-class accuracy</th>
            </tr>
          </thead>
          <tbody className="divide-y max-sm:block">
            {rows.map((r) => (
              <tr
                key={r.id}
                className="max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:py-3"
              >
                <th
                  scope="row"
                  className="px-2 py-2 text-left font-normal max-sm:col-span-1 max-sm:p-0"
                >
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block size-2 rounded-full"
                    style={{ background: r.color }}
                  />
                  <span className="num font-semibold">{r.id}</span>
                </th>
                <td
                  data-label="Cut-off"
                  className="num px-2 py-2 max-sm:p-0 max-sm:before:block max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]"
                >
                  {fixed(r.threshold)}
                </td>
                {r.cells.map((c) => (
                  <td
                    key={c.key}
                    data-label={METRICS.find((m) => m.key === c.key)?.label}
                    className="px-2 py-2 max-sm:p-0 max-sm:before:block max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]"
                  >
                    <span className="num block font-semibold">{pm(c.cvMean, c.cvStd)}</span>
                    <span className="num block text-xs text-muted-foreground">
                      hold-out {fixed(c.holdout)}
                    </span>
                  </td>
                ))}
                <td
                  data-label="Prevalence"
                  className="px-2 py-2 max-sm:p-0 max-sm:before:block max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]"
                >
                  <span className="num block">{pct(r.prevalence.train)} train</span>
                  <span className="num block text-xs text-muted-foreground">
                    {pct(r.prevalence.test)} hold-out
                  </span>
                </td>
                <td
                  data-label="Majority-class accuracy"
                  className="px-2 py-2 max-sm:p-0 max-sm:before:block max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]"
                >
                  <span className="num block">{pct(r.majority.train)} train</span>
                  <span className="num block text-xs text-muted-foreground">
                    {pct(r.majority.test)} hold-out
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {display && exampleTarget && (
        <div className="space-y-1 text-xs" data-testid="metric-sentences">
          <p className="font-medium">
            {fillText(display.performance.metric_example, {
              target: exampleTarget.label,
              n_test: metrics.split.n_test,
            })}
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {metricLines(display, metrics, exampleTarget, mode).map((l) => (
              <li key={l.key}>
                <GlossaryText text={l.text} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        ROC-AUC and Brier do not depend on the cut-off. Accuracy should be read against the
        majority-class reference: always predicting the commoner class would already score that
        high.
      </p>
    </Section>
  )
}

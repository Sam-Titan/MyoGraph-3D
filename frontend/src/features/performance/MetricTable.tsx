import { useState } from 'react'
import type { MetricsResponse } from '@/api/client'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { fixed, pct, pm } from '@/lib/format'
import { METRICS, metricRows, type ThresholdMode } from './performanceModel'
import { Section } from './Section'

const TH = 'px-2 py-2 text-left align-bottom font-medium'

export function MetricTable({ metrics }: { metrics: MetricsResponse }) {
  const [tuned, setTuned] = useState(true)
  const mode: ThresholdMode = tuned ? 'tuned' : 'default'
  const rows = metricRows(metrics, mode)
  const defaultThreshold = fixed(Object.values(metrics.targets)[0]?.threshold.default ?? 0.5)

  return (
    <Section
      title="Per-target metrics"
      caption="Top line is the cross-validated mean ± std on the training set; the grey line is the single hold-out value."
      aside={
        <div className="flex items-center gap-2">
          <Label htmlFor="threshold-mode" className="text-xs">
            Decision threshold: {tuned ? 'tuned' : defaultThreshold}
          </Label>
          <Switch id="threshold-mode" checked={tuned} onCheckedChange={setTuned} />
        </div>
      }
    >
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className={TH}>Target</th>
              <th className={TH}>Threshold</th>
              {METRICS.map((m) => (
                <th key={m.key} className={TH}>
                  {m.label}
                </th>
              ))}
              <th className={TH}>Prevalence</th>
              <th className={TH}>Majority-class accuracy</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="px-2 py-2 text-left font-normal">
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block size-2 rounded-full"
                    style={{ background: r.color }}
                  />
                  <span className="num font-semibold">{r.id}</span>
                </th>
                <td className="num px-2 py-2">{fixed(r.threshold)}</td>
                {r.cells.map((c) => (
                  <td key={c.key} className="px-2 py-2">
                    <span className="num block font-semibold">{pm(c.cvMean, c.cvStd)}</span>
                    <span className="num block text-xs text-muted-foreground">
                      hold-out {fixed(c.holdout)}
                    </span>
                  </td>
                ))}
                <td className="px-2 py-2">
                  <span className="num block">{pct(r.prevalence.train)} train</span>
                  <span className="num block text-xs text-muted-foreground">
                    {pct(r.prevalence.test)} hold-out
                  </span>
                </td>
                <td className="px-2 py-2">
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
      <p className="text-xs text-muted-foreground">
        ROC-AUC and Brier do not depend on the threshold. Accuracy should be read against the
        majority-class reference: always predicting the commoner class would already score that
        high.
      </p>
    </Section>
  )
}

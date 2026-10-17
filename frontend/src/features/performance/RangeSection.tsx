import type { MetricsResponse } from '@/api/client'
import { RANGE_MEANING } from '@/features/results/RangeNote'
import { pct } from '@/lib/format'
import { targetIds } from './performanceModel'
import { Section } from './Section'

const TH = 'px-2 py-2 text-left align-bottom font-medium'

/** Hold-out numbers for the bootstrap ranges: how wide they are and how often the point falls outside. */
export function RangeSection({ metrics }: { metrics: MetricsResponse }) {
  const u = metrics.uncertainty
  return (
    <Section title="Ranges on the hold-out set" caption={RANGE_MEANING}>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className={TH}>Target</th>
              <th className={TH}>Average range width</th>
              <th className={TH}>Estimate outside its own range</th>
            </tr>
          </thead>
          <tbody>
            {targetIds(metrics).map((id) => {
              const t = u.targets[id]
              return (
                <tr key={id} className="border-b last:border-0">
                  <th scope="row" className="num px-2 py-2 text-left font-semibold">
                    {id}
                  </th>
                  <td className="num px-2 py-2">{Math.round(t.mean_width * 100)} points</td>
                  <td className="num px-2 py-2">
                    {t.n_outside} of {t.n} hold-out patients
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Each range is the middle {pct(u.level)} of {u.n_models} retrained models; the shown estimate
        comes from the model trained on all training patients, so it can occasionally sit just
        outside.
      </p>
    </Section>
  )
}

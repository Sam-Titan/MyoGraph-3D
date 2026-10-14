import { useState } from 'react'
import type { MetricsResponse } from '@/api/client'
import { fixed } from '@/lib/format'
import { TOP_N, targetColor, targetIds, topImportance } from './performanceModel'
import { Section } from './Section'
import { TargetPicker } from './TargetPicker'

export function ImportanceChart({ metrics }: { metrics: MetricsResponse }) {
  const ids = targetIds(metrics)
  const [id, setId] = useState(ids[0] ?? '')
  const rows = topImportance(metrics, id)
  const max = rows[0]?.importance ?? 0
  const color = targetColor(Math.max(0, ids.indexOf(id)))

  return (
    <Section
      title={`Global feature importance · top ${TOP_N}`}
      caption="Average size of each input’s push on the model estimate across training patients (mean |SHAP|, log-odds); it shows influence, not cause."
      aside={
        <TargetPicker
          name="Importance"
          value={id}
          onChange={setId}
          options={ids.map((k, i) => ({
            id: k,
            label: metrics.targets[k].label,
            color: targetColor(i),
          }))}
        />
      }
    >
      <ol className="max-w-2xl space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem] items-center gap-2 text-xs sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3rem]"
          >
            <span className="truncate" title={r.label}>
              {r.label}
            </span>
            <span aria-hidden className="block h-3 min-w-0 rounded-sm bg-muted">
              <span
                className="block h-full rounded-sm"
                style={{
                  background: color,
                  width: `${max > 0 ? (r.importance / max) * 100 : 0}%`,
                }}
              />
            </span>
            <span className="num text-right">{fixed(r.importance)}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}

import { ArrowDownWideNarrow } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import type { BreakdownRow, GroupInfo, TargetInfo } from '@/api/client'
import { Switch } from '@/components/ui/switch'
import { signed } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  buildSections,
  contributionOf,
  formatReference,
  formatValue,
  maxAbsContribution,
  type SortMode,
} from './breakdownModel'

const STATUS_STYLE = {
  low: 'bg-status-low/10 text-status-low',
  normal: 'bg-muted text-muted-foreground',
  high: 'bg-status-high/10 text-status-high',
} as const

function StatusChip({ status }: { status: BreakdownRow['status'] }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-block rounded-full px-1.5 py-0.5 text-xs font-medium capitalize',
        STATUS_STYLE[status],
      )}
    >
      {status}
    </span>
  )
}

/** Signed mini-bar centred on zero; width is relative to the largest |contribution| shown. */
function MiniBar({ value, max }: { value: number; max: number }) {
  const half = max > 0 ? Math.min(50, (Math.abs(value) / max) * 50) : 0
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="relative h-2 w-10 shrink-0 rounded-sm bg-muted">
        <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <span
          className={cn(
            'absolute inset-y-0 rounded-sm',
            value >= 0 ? 'bg-contrib-up' : 'bg-contrib-down',
          )}
          style={
            value >= 0 ? { left: '50%', width: `${half}%` } : { right: '50%', width: `${half}%` }
          }
        />
      </span>
      <span className="num w-9 text-right text-xs">{signed(value)}</span>
    </span>
  )
}

interface Props {
  rows: BreakdownRow[]
  groups: GroupInfo[]
  target: TargetInfo
}

/** SPEC 6.2 physiological breakdown: measurements by default, findings on demand. */
export function BreakdownTable({ rows, groups, target }: Props) {
  const [showFindings, setShowFindings] = useState(false)
  const [sort, setSort] = useState<SortMode>('default')
  const switchId = useId()
  const sections = useMemo(
    () => buildSections(rows, groups, target.id, { showFindings, sort }),
    [rows, groups, target.id, showFindings, sort],
  )
  const max = useMemo(
    () =>
      maxAbsContribution(
        sections.flatMap((s) => s.rows),
        target.id,
      ),
    [sections, target.id],
  )

  return (
    <section aria-label="Physiological breakdown" className="rule-t space-y-2 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="t-section">Physiological breakdown</h3>
        <label
          htmlFor={switchId}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          Findings
          <Switch
            id={switchId}
            size="sm"
            checked={showFindings}
            onCheckedChange={setShowFindings}
          />
        </label>
      </div>
      <div>
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col />
            <col className="w-[5.5rem]" />
            <col className="w-[6.25rem]" />
          </colgroup>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-1.5 pr-2 font-medium">
                Measure
              </th>
              <th scope="col" className="px-2 py-1.5 font-medium">
                Reference and status
              </th>
              <th
                scope="col"
                className="py-1.5 pl-2 font-medium"
                aria-sort={sort === 'abs-desc' ? 'descending' : 'none'}
              >
                <button
                  type="button"
                  onClick={() => setSort((s) => (s === 'abs-desc' ? 'default' : 'abs-desc'))}
                  aria-pressed={sort === 'abs-desc'}
                  title="Sort by |contribution| within each group"
                  className={cn(
                    'inline-flex items-center gap-1 rounded hover:text-foreground',
                    sort === 'abs-desc' && 'text-foreground',
                  )}
                >
                  ± {target.id}
                  <ArrowDownWideNarrow className="size-3" aria-hidden />
                </button>
              </th>
            </tr>
          </thead>
          {sections.map((s) => (
            <tbody key={s.group.id}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={3}
                  className="px-0 pb-1 pt-3 text-left text-xs font-semibold text-foreground"
                >
                  {s.group.label}
                </th>
              </tr>
              {s.rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <th
                    scope="row"
                    className="min-w-0 break-words py-1.5 pr-2 text-left align-top font-normal"
                  >
                    <span className="block">{r.label}</span>
                    <span className="num text-muted-foreground">
                      {formatValue(r)}
                      {r.outside_training_range && ', outside training range'}
                    </span>
                  </th>
                  <td className="px-2 py-1.5 align-top">
                    <span className="num block text-muted-foreground">{formatReference(r)}</span>
                    <StatusChip status={r.status} />
                  </td>
                  <td className="py-1.5 pl-2 align-top">
                    <MiniBar value={contributionOf(r, target.id)} max={max} />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Reference ranges are typical adult values for display only; the model uses raw values.
        Contributions are log-odds toward {target.id}.
      </p>
    </section>
  )
}

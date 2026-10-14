import type { BreakdownRow, GroupInfo } from '@/api/client'

export interface BreakdownSection {
  group: GroupInfo
  rows: BreakdownRow[]
}

export type SortMode = 'default' | 'abs-desc'

export const contributionOf = (row: BreakdownRow, targetId: string): number =>
  row.contribution[targetId] ?? 0

/**
 * Rows bucketed by group (API group order, empty groups dropped). Measurements (number/derived)
 * always; findings (binary) only when asked. Sorting applies within each group.
 */
export function buildSections(
  rows: BreakdownRow[],
  groups: GroupInfo[],
  targetId: string,
  opts: { showFindings: boolean; sort: SortMode },
): BreakdownSection[] {
  const visible = rows.filter((r) => opts.showFindings || r.kind !== 'binary')
  return groups
    .map((group) => {
      const members = visible.filter((r) => r.group === group.id)
      if (opts.sort === 'abs-desc') {
        members.sort(
          (a, b) => Math.abs(contributionOf(b, targetId)) - Math.abs(contributionOf(a, targetId)),
        )
      }
      return { group, rows: members }
    })
    .filter((s) => s.rows.length > 0)
}

/** Largest |contribution| over the given rows, for scaling the mini-bars. */
export function maxAbsContribution(rows: BreakdownRow[], targetId: string): number {
  return rows.reduce((m, r) => Math.max(m, Math.abs(contributionOf(r, targetId))), 0)
}

const trimmed = (n: number, digits: number): string => String(Number(n.toFixed(digits)))

export function formatValue(row: BreakdownRow): string {
  if (row.kind === 'binary') return row.value >= 0.5 ? 'Yes' : 'No'
  const v = trimmed(row.value, 2)
  if (!row.unit) return v
  return row.unit === '%' ? `${v}%` : `${v} ${row.unit}`
}

export function formatReference(row: BreakdownRow): string {
  if (!row.reference) return '—'
  const { low, high } = row.reference
  return `${trimmed(low, 2)}–${trimmed(high, 2)}`
}

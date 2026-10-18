import { pct } from '@/lib/format'

/** "Estimates updated. CAD 85%, LAD 75%, ..." for a screen-reader live region. Empty without numbers. */
export function announcement(
  targets: readonly { id: string }[],
  probabilities: Readonly<Record<string, number | undefined>>,
): string {
  const parts = targets.flatMap((t) =>
    probabilities[t.id] === undefined ? [] : [`${t.id} ${pct(probabilities[t.id])}`],
  )
  return parts.length === 0 ? '' : `Estimates updated. ${parts.join(', ')}.`
}

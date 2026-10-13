/** The one rounding rule for probabilities: integer %, everywhere (cards, labels, legend, WHY header). */
export const pct = (p: number | undefined | null): string =>
  p === undefined || p === null ? '—' : `${Math.round(p * 100)}%`

/** Signed log-odds with two decimals, e.g. `+0.42` / `−0.18` (true minus sign). */
export const signed = (x: number): string => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(2)}`

/** Fixed-decimal number for metrics (AUC, Brier, ...), e.g. `0.93`. */
export const fixed = (x: number, digits = 2): string => x.toFixed(digits)

/** Mean ± spread, e.g. `0.93 ± 0.03`. */
export const pm = (mean: number, std: number, digits = 2): string =>
  `${fixed(mean, digits)} ± ${fixed(std, digits)}`

/** `A, B and C`. */
export const joinList = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/** `1st`, `2nd`, `3rd`, `4th`, ... */
export const ordinal = (n: number): string => {
  const r = n % 100
  if (r >= 11 && r <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

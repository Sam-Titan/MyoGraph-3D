/** The one rounding rule for probabilities: integer %, everywhere (cards, labels, legend, WHY header). */
export const pct = (p: number | undefined | null): string =>
  p === undefined || p === null ? '—' : `${Math.round(p * 100)}%`

/** Signed log-odds with two decimals, e.g. `+0.42` / `−0.18` (true minus sign). */
export const signed = (x: number): string => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(2)}`

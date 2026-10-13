/**
 * Calibrated probability -> colour (SPEC 6.3). Stops match the `--risk-*` tokens in index.css:
 * 0.0 green -> 0.5 amber -> 1.0 red, interpolated in OKLCH (shortest hue path). Pure, no three.js.
 * Colour is never shown without the number: callers always render the % next to it.
 */

/** sRGB, each channel 0..1. */
export type Rgb = readonly [number, number, number]
type Lch = readonly [number, number, number]

const STOPS: { at: number; hex: string }[] = [
  { at: 0, hex: '#22c55e' },
  { at: 0.5, hex: '#f59e0b' },
  { at: 1, hex: '#ef4444' },
]

/** Shown before any prediction exists: deliberately not on the risk scale. */
export const NEUTRAL: Rgb = [0.55, 0.6, 0.68]

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function rgbToOklch([r, g, b]: Rgb): Lch {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(a, bb), Math.atan2(bb, a)]
}

function oklchToRgb([L, C, h]: Lch): Rgb {
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [clamp01(fromLinear(r)), clamp01(fromLinear(g)), clamp01(fromLinear(bl))]
}

const STOPS_LCH = STOPS.map((s) => ({ at: s.at, lch: rgbToOklch(hexToRgb(s.hex)) }))

/** Interpolated risk colour for probability `p` (clamped to 0..1). */
export function riskRgb(p: number): Rgb {
  const x = clamp01(p)
  const hi = Math.max(
    1,
    STOPS_LCH.findIndex((s) => s.at >= x),
  )
  const [a, b] = [STOPS_LCH[hi - 1], STOPS_LCH[hi]]
  const t = (x - a.at) / (b.at - a.at)
  let dh = b.lch[2] - a.lch[2]
  if (dh > Math.PI) dh -= 2 * Math.PI
  if (dh < -Math.PI) dh += 2 * Math.PI
  return oklchToRgb([
    a.lch[0] + (b.lch[0] - a.lch[0]) * t,
    a.lch[1] + (b.lch[1] - a.lch[1]) * t,
    a.lch[2] + dh * t,
  ])
}

export const rgbCss = ([r, g, b]: Rgb): string =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`

export const riskCss = (p: number): string => rgbCss(riskRgb(p))

/** Emissive intensity grows with risk so high-risk vessels read as "hot" on the dark backdrop. */
export const riskEmissive = (p: number): number => 0.12 + 0.5 * clamp01(p)

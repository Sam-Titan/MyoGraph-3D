import { describe, expect, it } from 'vitest'
import { deltaMark, deltaText, makePin, pinDeltas } from './pinModel'

const pin = makePin({ LAD: 0.81, RCA: 0.2, CAD: 0.9 }, {
  LAD: { interval: { lo: 0.6, hi: 0.92 } },
  RCA: { interval: { lo: 0.1, hi: 0.3 } },
} as never)

describe('pin deltas', () => {
  it('uses point estimates and rounded percentages, so the numbers add up', () => {
    const d = pinDeltas(pin, { LAD: 0.64, RCA: 0.2, CAD: 0.904 })
    expect(deltaText(d.LAD)).toBe('81% → 64% ▼17')
    expect(d.LAD.points).toBe(-17)
    expect(deltaMark(d.RCA)).toBe('no change')
    expect(deltaText(d.CAD)).toBe('90% → 90% no change')
  })

  it('flags a new point estimate that is inside the pinned range', () => {
    const d = pinDeltas(pin, { LAD: 0.64, RCA: 0.45, CAD: 0.7 })
    expect(d.LAD.withinUncertainty).toBe(true) // 0.64 in [0.60, 0.92]
    expect(d.RCA.withinUncertainty).toBe(false) // 0.45 outside [0.10, 0.30]
    expect(d.CAD.withinUncertainty).toBe(false) // pinned before ranges loaded: unknown, so no claim
  })

  it('range edges count as inside; a rise is shown as up', () => {
    const d = pinDeltas(pin, { LAD: 0.92, RCA: 0.3 })
    expect(d.LAD.withinUncertainty && d.RCA.withinUncertainty).toBe(true)
    expect(deltaMark(d.RCA)).toBe('▲10')
  })

  it('has no deltas without a pin or for targets without a current estimate', () => {
    expect(pinDeltas(null, { LAD: 0.5 })).toEqual({})
    expect(Object.keys(pinDeltas(pin, { LAD: 0.5 }))).toEqual(['LAD'])
  })
})

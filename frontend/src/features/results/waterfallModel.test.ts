import { describe, expect, it } from 'vitest'
import { at, axisFor, dotStates, stepPoints, type WaterfallStep } from './waterfallModel'

const step = (from_p: number, to_p: number): WaterfallStep => ({
  feature: 'x',
  label: 'X',
  value_display: '1',
  from_p,
  to_p,
})

describe('waterfall model', () => {
  it('sizes steps in signed whole points', () => {
    expect(stepPoints(step(0.6, 0.78))).toBe(18)
    expect(stepPoints(step(0.78, 0.7))).toBe(-8)
  })

  it('rounds the axis out to 10% ticks and keeps range and cut-off inside it', () => {
    const axis = axisFor([step(0.64, 0.7), step(0.7, 0.78)], { lo: 0.65, hi: 0.87 }, 0.48)
    expect(axis.min).toBeCloseTo(0.3)
    expect(axis.max).toBeCloseTo(1)
    expect(at(axis, 0.3)).toBe(0)
    expect(at(axis, 1)).toBe(100)
  })

  it('draws a solid band to the range start, a light band across it, and rings the estimate', () => {
    const { states, ring } = dotStates(0.78, { lo: 0.65, hi: 0.87 })
    expect(states.filter((s) => s === 'solid')).toHaveLength(65)
    expect(states.filter((s) => s === 'light')).toHaveLength(22)
    expect(states.filter((s) => s === 'empty')).toHaveLength(13)
    expect(ring).toBe(77)
    expect(states[ring]).toBe('light')
  })
})

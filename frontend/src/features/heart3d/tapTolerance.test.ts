import { describe, expect, it } from 'vitest'
import { nearestWithin } from './tapTolerance'

const pts = [
  { id: 'LAD', x: 100, y: 100 },
  { id: 'LCX', x: 130, y: 100 },
]

describe('nearestWithin', () => {
  it('picks the nearest point inside the radius', () => {
    expect(nearestWithin(pts, 120, 100)).toBe('LCX')
    expect(nearestWithin(pts, 110, 100)).toBe('LAD')
  })
  it('returns null when nothing is within the radius', () => {
    expect(nearestWithin(pts, 100, 160)).toBeNull()
    expect(nearestWithin([], 0, 0)).toBeNull()
  })
  it('includes points exactly on the radius', () => {
    expect(nearestWithin(pts, 100, 124, 24)).toBe('LAD')
  })
})

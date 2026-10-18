import { describe, expect, it } from 'vitest'
import {
  distToSegment,
  nearestWithin,
  type ScreenPoint,
  type ScreenPolyline,
  visibleAt,
  visibleRuns,
} from './tapTolerance'

const pt = (x: number, y: number, depth = 1): ScreenPoint => ({ x, y, depth })
const line = (id: string, ...pts: ScreenPoint[]): ScreenPolyline => ({ id, pts })

const pts = [line('LAD', pt(100, 100)), line('LCX', pt(130, 100))]

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
  it('measures to the segment between samples, not just the samples', () => {
    const lad = [line('LAD', pt(0, 100), pt(120, 100))]
    // 60 px from both ends, 10 px off the line: only the segment is close enough.
    expect(nearestWithin(lad, 60, 110)).toBe('LAD')
    expect(nearestWithin([line('LAD', pt(0, 100)), line('LAD', pt(120, 100))], 60, 110)).toBeNull()
    expect(nearestWithin(lad, 60, 140)).toBeNull()
  })
  it('does not bridge separate polylines of the same vessel', () => {
    const split = [line('LAD', pt(0, 100), pt(20, 100)), line('LAD', pt(100, 100), pt(120, 100))]
    expect(nearestWithin(split, 60, 100)).toBeNull()
  })
  it('lets the nearer segment win and the earlier line win ties', () => {
    const two = [line('LAD', pt(0, 100), pt(100, 100)), line('LCX', pt(0, 110), pt(100, 110))]
    expect(nearestWithin(two, 50, 108)).toBe('LCX')
    expect(nearestWithin(two, 50, 105)).toBe('LAD')
  })
})

describe('distToSegment', () => {
  it('clamps to the end points and handles a zero-length segment', () => {
    expect(distToSegment(0, 0, 3, 0, 10, 0)).toBe(3)
    expect(distToSegment(5, 5, 5, 5, 5, 5)).toBe(0)
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBe(3)
  })
})

describe('occlusion', () => {
  it('hides points behind the surface hit, keeps those on or in front of it', () => {
    expect(visibleAt(5, 4)).toBe(false)
    expect(visibleAt(4.05, 4)).toBe(true)
    expect(visibleAt(3, 4)).toBe(true)
  })
  it('hides nothing when the ray hit no surface', () => {
    expect(visibleAt(100, undefined)).toBe(true)
  })
  it('splits a polyline at hidden stretches', () => {
    const runs = visibleRuns([pt(0, 0, 3), pt(1, 0, 9), pt(2, 0, 3), pt(3, 0, 3)], 4)
    expect(runs.map((r) => r.length)).toEqual([1, 2])
  })
  it('a hidden vessel cannot win a tap, a visible farther one can', () => {
    const surface = 4
    const hidden = line('RCA', pt(100, 100, 6), pt(140, 100, 6))
    const front = line('LAD', pt(100, 120, 3.9), pt(140, 120, 3.9))
    const lines = (ls: ScreenPolyline[]) =>
      ls.flatMap((l) => visibleRuns(l.pts, surface).map((pts) => ({ id: l.id, pts })))
    expect(nearestWithin(lines([hidden, front]), 120, 102)).toBe('LAD')
    expect(nearestWithin(lines([hidden]), 120, 100)).toBeNull()
  })
})

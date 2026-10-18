import { describe, expect, it } from 'vitest'
import { announcement } from './estimateAnnouncement'

describe('announcement', () => {
  const targets = [{ id: 'CAD' }, { id: 'LAD' }, { id: 'LCX' }]
  it('lists the targets that have a number, in target order', () => {
    expect(announcement(targets, { LAD: 0.754, CAD: 0.851 })).toBe(
      'Estimates updated. CAD 85%, LAD 75%.',
    )
  })
  it('is empty before the first estimate', () => {
    expect(announcement(targets, {})).toBe('')
  })
})

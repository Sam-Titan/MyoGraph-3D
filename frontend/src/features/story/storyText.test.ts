import { describe, expect, it } from 'vitest'
import type { PredictResponse, StoryStep, TargetInfo } from '@/api/client'
import { evalCondition, highlightedFactors, renderStep, type StoryContext } from './storyText'

const targets: TargetInfo[] = [
  {
    id: 'CAD',
    label: 'CAD',
    plain_label: 'coronary artery disease',
    role: 'overall',
    node: 'heart',
  },
  {
    id: 'AAA',
    label: 'AAA',
    plain_label: 'some artery',
    role: 'vessel',
    node: 'a',
    where: 'front of the heart',
  },
]

const response = {
  targets: {
    CAD: { probability: 0.98, positive: true, threshold: 0.48 },
    AAA: { probability: 0.2, positive: false, threshold: 0.5 },
  },
  explanations: {
    CAD: {
      base_probability: 0.6,
      base_logit: 0.4,
      contributions: [
        { id: 'a', label: 'Age', display_value: '70', logit: 1.2 },
        { id: 'b', label: 'Chest pain type', display_value: 'None', logit: -0.9 },
        { id: 'c', label: 'T inversion', display_value: 'Yes', logit: 0.7 },
      ],
    },
  },
} as unknown as PredictResponse

const ctx = (truth: Record<string, boolean> | null): StoryContext => ({ targets, response, truth })

const step = (over: Partial<StoryStep>): StoryStep => ({
  id: 's',
  reveal_truth: false,
  parts: [{ text: 'x', when: [] }],
  camera: null,
  highlight: null,
  ...over,
})

describe('conditions', () => {
  it('compares with the threshold and the margin', () => {
    expect(evalCondition('above_threshold:CAD', ctx(null))).toBe(true)
    expect(evalCondition('well_above_threshold:CAD', ctx(null))).toBe(true)
    expect(evalCondition('below_threshold:AAA', ctx(null))).toBe(true)
    expect(evalCondition('well_below_threshold:AAA', ctx(null))).toBe(true)
    expect(evalCondition('well_below_threshold:CAD', ctx(null))).toBe(false)
  })

  it('agrees / disagrees need the real result', () => {
    expect(evalCondition('disagrees:CAD', ctx(null))).toBe(false)
    expect(evalCondition('agrees:CAD', ctx(null))).toBe(false)
    expect(evalCondition('disagrees:CAD', ctx({ CAD: false }))).toBe(true)
    expect(evalCondition('agrees:AAA', ctx({ AAA: false }))).toBe(true)
    expect(evalCondition('any_disagrees', ctx({ CAD: false, AAA: false }))).toBe(true)
    expect(evalCondition('all_agree', ctx({ CAD: true, AAA: false }))).toBe(true)
    expect(evalCondition('all_agree', ctx(null))).toBe(false)
  })
})

describe('rendering', () => {
  it('fills numbers from the response, never from the text', () => {
    const s = step({
      parts: [
        { text: 'It is {p:CAD} against {thr:CAD}; {name:AAA} on the {where:AAA}.', when: [] },
      ],
    })
    expect(renderStep(s, ctx(null))).toEqual([
      'It is 98% against 48%; AAA on the front of the heart.',
    ])
  })

  it('skips parts whose condition fails and keeps the rest', () => {
    const s = step({
      parts: [
        { text: 'Always.', when: [] },
        { text: 'Far above.', when: ['well_above_threshold:CAD'] },
        { text: 'Below.', when: ['below_threshold:CAD'] },
      ],
    })
    expect(renderStep(s, ctx(null))).toEqual(['Always.', 'Far above.'])
  })

  it('reads direction-aware factors and still reads right with fewer than asked', () => {
    const up = step({
      highlight: { target: 'CAD', direction: 'up', top: 3 },
      parts: [
        { text: 'Base.', when: [] },
        { text: 'Raised it: {factors_up:3}.', when: [] },
      ],
    })
    expect(renderStep(up, ctx(null))).toEqual(['Base.', 'Raised it: Age and T inversion.'])
    const down = step({
      highlight: { target: 'CAD', direction: 'down', top: 3 },
      parts: [
        { text: 'Base.', when: [] },
        { text: 'Lowered it: {factors_down:3}.', when: [] },
      ],
    })
    expect(renderStep(down, ctx(null))).toEqual(['Base.', 'Lowered it: Chest pain type.'])
    expect(highlightedFactors(down, ctx(null)).map((c) => c.id)).toEqual(['b'])
  })

  it('drops a factor sentence when nothing pushed in that direction', () => {
    const none = {
      ...response,
      explanations: { CAD: { ...response.explanations.CAD, contributions: [] } },
    } as unknown as PredictResponse
    const s = step({
      highlight: { target: 'CAD', direction: 'up', top: 3 },
      parts: [
        { text: 'Base.', when: [] },
        { text: 'Raised it: {factors_up:3}.', when: [] },
      ],
    })
    expect(renderStep(s, { targets, response: none, truth: null })).toEqual(['Base.'])
  })

  it('renders the real result in plain words', () => {
    const s = step({ reveal_truth: true, parts: [{ text: '{truth:CAD}; {truth:AAA}.', when: [] }] })
    expect(renderStep(s, ctx({ CAD: true, AAA: false }))).toEqual([
      'narrowing (stenosis) found; no narrowing found.',
    ])
  })
})

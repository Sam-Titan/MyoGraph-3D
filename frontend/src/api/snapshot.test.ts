import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { Preset } from '@/api/client'
import { queryKeys } from '@/api/queries'
import { dropStale, parseSnapshot, type Snapshot, seedSnapshot } from './snapshot'

const features = {
  features: [
    {
      id: 'age',
      label: 'Age',
      group: 'demographics',
      kind: 'number',
      input: { min: 20, max: 100, step: 1 },
      default: 50,
    },
  ],
}
const preset: Preset = { id: 'p1', label: 'P1', description: '', values: { age: 60 }, truth: {} }

function snapshot(version = 'v1'): Snapshot {
  return {
    model_version: version,
    first_visit_preset_id: 'p1',
    features,
    display: { headline: 'h' },
    presets: [preset],
    stories: { stories: [] },
    entries: {
      p1: {
        values_hash: 'x',
        values: preset.values,
        predict: { model_version: version, targets: {} },
        intervals: { model_version: version, targets: {} },
      },
    },
  } as unknown as Snapshot
}

const predictKey = queryKeys.predict({ age: 60 })

describe('parseSnapshot', () => {
  it('rejects anything that is not a snapshot', () => {
    expect(parseSnapshot(null)).toBeNull()
    expect(parseSnapshot({ model_version: 'v1' })).toBeNull()
    expect(parseSnapshot(snapshot())).not.toBeNull()
  })
})

describe('seedSnapshot', () => {
  it('stores the preset estimate under the key live predict uses', () => {
    const qc = new QueryClient()
    seedSnapshot(qc, snapshot())
    expect(qc.getQueryData(predictKey)).toMatchObject({ model_version: 'v1' })
    expect(qc.getQueryData(queryKeys.intervals({ age: 60 }))).toBeDefined()
    expect(qc.getQueryData(queryKeys.presets)).toEqual([preset])
  })

  it('never overwrites what the live API already delivered', () => {
    const qc = new QueryClient()
    qc.setQueryData(predictKey, { model_version: 'live' })
    seedSnapshot(qc, snapshot())
    expect(qc.getQueryData(predictKey)).toEqual({ model_version: 'live' })
  })
})

describe('dropStale', () => {
  it('ignores the whole snapshot when the model version differs', () => {
    const qc = new QueryClient()
    seedSnapshot(qc, snapshot('old'))
    dropStale(qc, snapshot('old'), { model_version: 'new', presets: [preset] })
    expect(qc.getQueryData(predictKey)).toBeUndefined()
    expect(qc.getQueryData(queryKeys.features)).toBeUndefined()
  })

  it('drops only the preset whose input values changed', () => {
    const qc = new QueryClient()
    seedSnapshot(qc, snapshot())
    dropStale(qc, snapshot(), {
      model_version: 'v1',
      presets: [{ ...preset, values: { age: 61 } }],
    })
    expect(qc.getQueryData(predictKey)).toBeUndefined()
  })

  it('keeps everything when version and preset values match', () => {
    const qc = new QueryClient()
    seedSnapshot(qc, snapshot())
    dropStale(qc, snapshot(), { model_version: 'v1', presets: [preset] })
    expect(qc.getQueryData(predictKey)).toBeDefined()
  })
})

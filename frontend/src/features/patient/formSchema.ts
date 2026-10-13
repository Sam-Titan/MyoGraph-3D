import { z } from 'zod'
import type { FeatureInfo, Preset } from '@/api/client'
import { isDerived } from '@/lib/features'

export type FormValues = Record<string, number | string>

const fmt = (n: number): string => String(Number(n.toFixed(4)))

/** One zod rule per client-sent input, built from the features payload. Mirrors backend validation. */
type FieldSchema = z.ZodType<number | string, number | string>

function fieldSchema(f: FeatureInfo): FieldSchema {
  switch (f.kind) {
    case 'number': {
      const b = f.input
      const base = z.number({ error: 'Enter a number' }).finite('Enter a number')
      if (!b) return base
      const msg = `Must be between ${fmt(b.min)} and ${fmt(b.max)}`
      return base.min(b.min, msg).max(b.max, msg)
    }
    case 'binary':
      return z.union([z.literal(0), z.literal(1)], { error: 'Must be yes or no' })
    case 'category':
    case 'composite': {
      const values = f.options.map((o) => o.value)
      return z.string().refine((v) => values.includes(v), { error: 'Choose an option' })
    }
    default:
      throw new Error(`Feature ${f.id}: no form schema for kind "${f.kind}"`)
  }
}

export function buildFormSchema(features: FeatureInfo[]) {
  const shape: Record<string, FieldSchema> = {}
  for (const f of features) {
    if (!isDerived(f)) shape[f.id] = fieldSchema(f)
  }
  return z.object(shape)
}

/**
 * Initial values straight from `features[].default`. A missing default is a backend/artifact bug,
 * so fail loudly instead of inventing a value.
 */
export function defaultValues(features: FeatureInfo[]): FormValues {
  const out: FormValues = {}
  for (const f of features) {
    if (isDerived(f)) continue
    if (f.default === null || f.default === undefined) {
      throw new Error(`/api/features: input "${f.id}" has no default (backend bug)`)
    }
    out[f.id] = f.default
  }
  return out
}

/** A preset replaces every input; keys the preset lacks fall back to the defaults. */
export function valuesForPreset(preset: Preset, features: FeatureInfo[]): FormValues {
  const inputs = new Set(features.filter((f) => !isDerived(f)).map((f) => f.id))
  const out = defaultValues(features)
  for (const [id, v] of Object.entries(preset.values)) {
    if (inputs.has(id)) out[id] = v
  }
  return out
}

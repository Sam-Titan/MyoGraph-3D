import { useEffect, useMemo } from 'react'
import type { z } from 'zod'
import { usePredict } from '@/api/queries'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { useAppStore } from '@/store/app'
import type { FormValues } from './formSchema'

export const PREDICT_DEBOUNCE_MS = 300
/** Extra wait before the ranges (about 15x the CPU of a predict) are requested for the same values. */
export const INTERVALS_EXTRA_DEBOUNCE_MS = 400

export type LiveState = 'live' | 'busy' | 'paused' | 'error'

/**
 * Debounce → validate → predict. Only zod-valid values are ever sent; the validated values are
 * published to the store so the results panel reads the same cached query.
 */
export function useLivePredict(values: FormValues, schema: z.ZodType<FormValues, FormValues>) {
  // Key on the serialised values: `watch()` returns a fresh object each render.
  const key = JSON.stringify(values)
  // Nothing is predicted before the first-visit preset is in the form: the page would otherwise
  // pay for (and flash) a full estimate of placeholder values.
  const settled = useAppStore((s) => s.presetSettled)
  const gatedKey = settled ? key : null
  const debouncedKey = useDebouncedValue(gatedKey, PREDICT_DEBOUNCE_MS)
  const setPredictValues = useAppStore((s) => s.setPredictValues)
  const setIntervalValues = useAppStore((s) => s.setIntervalValues)

  const valid = useMemo(() => schema.safeParse(values).success, [schema, values])
  const debounced = useMemo(() => {
    if (debouncedKey === null) return null
    const parsed = schema.safeParse(JSON.parse(debouncedKey))
    return parsed.success ? parsed.data : null
  }, [schema, debouncedKey])

  const query = usePredict(debounced)
  useEffect(() => setPredictValues(debounced), [debounced, setPredictValues])
  // Ranges follow later; changing the key aborts the superseded request (TanStack passes `signal`).
  const slow = useDebouncedValue(debounced, INTERVALS_EXTRA_DEBOUNCE_MS)
  useEffect(() => setIntervalValues(slow), [slow, setIntervalValues])

  const pending = gatedKey !== debouncedKey
  const stale = pending || query.isFetching || query.isPlaceholderData
  let state: LiveState = 'live'
  if (!valid) state = 'paused'
  else if (query.isError) state = 'error'
  else if (stale || !settled) state = 'busy'

  return { query, valid, state, /** shown data lags the form */ stale }
}

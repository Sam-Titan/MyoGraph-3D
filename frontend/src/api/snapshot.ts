import type { QueryClient } from '@tanstack/react-query'
import {
  type DisplayConfig,
  type FeaturesResponse,
  getPresets,
  type IntervalsResponse,
  type PredictResponse,
  type Preset,
  type Stories,
} from '@/api/client'
import { queryKeys } from '@/api/queries'
import { buildFormSchema, valuesForPreset } from '@/features/patient/formSchema'

/** `public/snapshot.json`, written by `make snapshot` (backend/app/snapshot.py). */
export interface SnapshotEntry {
  values_hash: string
  values: Preset['values']
  predict: PredictResponse
  intervals: IntervalsResponse
}

export interface Snapshot {
  model_version: string
  first_visit_preset_id: string
  features: FeaturesResponse
  display: DisplayConfig
  presets: Preset[]
  stories: Stories
  entries: Record<string, SnapshotEntry>
}

export const SNAPSHOT_URL = '/snapshot.json'

const STATIC_KEYS = ['features', 'display', 'presets', 'stories'] as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Shape check only; whether the numbers are still current is `dropStale`'s job. */
export function parseSnapshot(raw: unknown): Snapshot | null {
  if (!isRecord(raw) || typeof raw.model_version !== 'string') return null
  if (!STATIC_KEYS.every((k) => k in raw) || !isRecord(raw.entries)) return null
  if (!Array.isArray(raw.presets)) return null
  return raw as unknown as Snapshot
}

/** Order-independent deep equality for the plain JSON values of a preset. */
function sameValues(a: Preset['values'], b: Preset['values']): boolean {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => k in b && a[k] === b[k])
}

/** The cache keys one entry is stored under: the zod-parsed values, exactly as live predict sends them. */
function entryKeys(
  snap: Snapshot,
  id: string,
): { predict: unknown[]; intervals: unknown[] } | null {
  const preset = snap.presets.find((p) => p.id === id)
  const entry = snap.entries[id]
  if (!preset || !entry || !sameValues(preset.values, entry.values)) return null
  const parsed = buildFormSchema(snap.features.features).safeParse(
    valuesForPreset(preset, snap.features.features),
  )
  if (!parsed.success) return null
  return {
    predict: [...queryKeys.predict(parsed.data)],
    intervals: [...queryKeys.intervals(parsed.data)],
  }
}

/** Fills the query cache, never overwriting anything the live API already delivered. */
export function seedSnapshot(qc: QueryClient, snap: Snapshot): void {
  const seed = (key: readonly unknown[], data: unknown) => {
    if (qc.getQueryData(key) === undefined) qc.setQueryData(key, data)
  }
  for (const k of STATIC_KEYS) seed(queryKeys[k], snap[k])
  for (const id of Object.keys(snap.entries)) {
    const keys = entryKeys(snap, id)
    if (!keys) continue
    seed(keys.predict, snap.entries[id].predict)
    seed(keys.intervals, snap.entries[id].intervals)
  }
}

/** Resets every seeded query (active ones refetch live). Returns nothing: callers only need the effect. */
function reset(qc: QueryClient, keys: readonly (readonly unknown[])[]): void {
  for (const queryKey of keys) void qc.resetQueries({ queryKey, exact: true })
}

/**
 * Compares the snapshot with the live API and resets what no longer matches: everything when the
 * model version differs, one preset's two estimates when that preset's input values changed.
 */
export function dropStale(
  qc: QueryClient,
  snap: Snapshot,
  live: { model_version: string; presets: Preset[] },
): void {
  const all = Object.keys(snap.entries)
  const staleIds =
    live.model_version !== snap.model_version
      ? all
      : all.filter((id) => {
          const p = live.presets.find((x) => x.id === id)
          return !p || !sameValues(p.values, snap.entries[id].values)
        })
  if (staleIds.length === 0) return
  const keys: (readonly unknown[])[] = []
  for (const id of staleIds) {
    const k = entryKeys(snap, id)
    if (k) keys.push(k.predict, k.intervals)
  }
  if (live.model_version !== snap.model_version) keys.push(...STATIC_KEYS.map((k) => queryKeys[k]))
  else keys.push(queryKeys.presets)
  reset(qc, keys)
}

/** After the live health probe succeeds, checks the snapshot against the live model and presets. */
function verifyWhenLive(qc: QueryClient, snap: Snapshot): void {
  let done = false
  const unsubscribe = qc.getQueryCache().subscribe((event) => {
    const health = qc.getQueryData<{ model_version: string }>(queryKeys.health)
    if (done || event.type !== 'updated' || !health) return
    done = true
    unsubscribe()
    getPresets()
      .then((presets) => dropStale(qc, snap, { model_version: health.model_version, presets }))
      .catch(() => undefined) // The live path is already running; nothing to fall back to.
  })
}

/**
 * Paints the first screen from `snapshot.json` without waiting for the API. Never blocks render;
 * a missing, invalid or late snapshot silently leaves the live path in charge.
 */
export async function loadSnapshot(qc: QueryClient): Promise<void> {
  try {
    const res = await fetch(SNAPSHOT_URL)
    if (!res.ok) return
    const snap = parseSnapshot(await res.json())
    if (!snap) return
    seedSnapshot(qc, snap)
    verifyWhenLive(qc, snap)
  } catch {
    // Offline, blocked or malformed: the app works exactly as before.
  }
}

import { create } from 'zustand'
import type { PredictRequest } from '@/api/client'
import type { Pin } from '@/features/results/pinModel'

export type Tab = 'workspace' | 'performance' | 'benchmark' | 'about'

interface AppState {
  tab: Tab
  /** Target id from /api/features; null until features load (see `useInitSelectedTarget`). */
  selectedTarget: string | null
  selectedPresetId: string | null
  /** The patient was edited after a preset loaded, so the preset's `truth` no longer applies. */
  presetEdited: boolean
  /** Debounced, zod-valid form values the shared predict query runs on; null while invalid. */
  predictValues: PredictRequest['values'] | null
  /** Same values, trailing predictValues by a longer debounce: what the (costlier) intervals query runs on. */
  intervalValues: PredictRequest['values'] | null
  /** Estimates saved by “Pin this result”; later edits are shown as changes against it. */
  pinned: Pin | null
  /** Header counts of the patient form, shown on the phone's "Edit patient" button. */
  patientSummary: { edited: number; outside: number }
  setPatientSummary: (summary: { edited: number; outside: number }) => void
  setPinned: (pin: Pin | null) => void
  setTab: (tab: Tab) => void
  setSelectedTarget: (id: string | null) => void
  setSelectedPresetId: (id: string | null) => void
  setPresetEdited: (edited: boolean) => void
  setPredictValues: (values: PredictRequest['values'] | null) => void
  setIntervalValues: (values: PredictRequest['values'] | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  tab: 'workspace',
  selectedTarget: null,
  selectedPresetId: null,
  presetEdited: false,
  predictValues: null,
  intervalValues: null,
  pinned: null,
  patientSummary: { edited: 0, outside: 0 },
  setPatientSummary: (patientSummary) =>
    set((s) =>
      s.patientSummary.edited === patientSummary.edited &&
      s.patientSummary.outside === patientSummary.outside
        ? s
        : { patientSummary },
    ),
  setPinned: (pinned) => set({ pinned }),
  setTab: (tab) => set({ tab }),
  setSelectedTarget: (selectedTarget) => set({ selectedTarget }),
  setSelectedPresetId: (selectedPresetId) => set({ selectedPresetId }),
  setPresetEdited: (presetEdited) => set({ presetEdited }),
  setPredictValues: (predictValues) => set({ predictValues }),
  setIntervalValues: (intervalValues) => set({ intervalValues }),
}))

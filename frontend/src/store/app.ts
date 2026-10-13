import { create } from 'zustand'
import type { PredictRequest } from '@/api/client'

export type Tab = 'workspace' | 'performance' | 'about'

interface AppState {
  tab: Tab
  /** Target id from /api/features; null until features load (see `useInitSelectedTarget`). */
  selectedTarget: string | null
  selectedPresetId: string | null
  /** The patient was edited after a preset loaded, so the preset's `truth` no longer applies. */
  presetEdited: boolean
  /** Debounced, zod-valid form values the shared predict query runs on; null while invalid. */
  predictValues: PredictRequest['values'] | null
  setTab: (tab: Tab) => void
  setSelectedTarget: (id: string | null) => void
  setSelectedPresetId: (id: string | null) => void
  setPresetEdited: (edited: boolean) => void
  setPredictValues: (values: PredictRequest['values'] | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  tab: 'workspace',
  selectedTarget: null,
  selectedPresetId: null,
  presetEdited: false,
  predictValues: null,
  setTab: (tab) => set({ tab }),
  setSelectedTarget: (selectedTarget) => set({ selectedTarget }),
  setSelectedPresetId: (selectedPresetId) => set({ selectedPresetId }),
  setPresetEdited: (presetEdited) => set({ presetEdited }),
  setPredictValues: (predictValues) => set({ predictValues }),
}))

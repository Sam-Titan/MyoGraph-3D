import { create } from 'zustand'

export type Tab = 'workspace' | 'performance' | 'about'

interface AppState {
  tab: Tab
  /** Target id from /api/features; null until features load (see `useInitSelectedTarget`). */
  selectedTarget: string | null
  selectedPresetId: string | null
  setTab: (tab: Tab) => void
  setSelectedTarget: (id: string | null) => void
  setSelectedPresetId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  tab: 'workspace',
  selectedTarget: null,
  selectedPresetId: null,
  setTab: (tab) => set({ tab }),
  setSelectedTarget: (selectedTarget) => set({ selectedTarget }),
  setSelectedPresetId: (selectedPresetId) => set({ selectedPresetId }),
}))

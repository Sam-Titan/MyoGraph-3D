import { create } from 'zustand'
import type { FormValues } from '@/features/patient/formSchema'
import type { Pin } from '@/features/results/pinModel'
import type { Tab } from '@/store/app'

/** The patient as it was before a story started, restored on exit or finish. */
export interface Snapshot {
  values: FormValues
  presetId: string | null
  edited: boolean
  selected: string | null
  tab: Tab
  pinned: Pin | null
}

export interface ActiveStory {
  id: string
  step: number
  snapshot: Snapshot
}

interface StoryState {
  active: ActiveStory | null
  /** The real catheterisation result is hidden in the UI until a step reveals it. */
  revealed: boolean
  /** Factors (feature ids of `target`'s explanation) the current step points at. */
  highlight: { target: string; ids: string[] } | null
  menuOpen: boolean
  begin: (id: string, snapshot: Snapshot) => void
  setStep: (step: number) => void
  setRevealed: (revealed: boolean) => void
  setHighlight: (highlight: StoryState['highlight']) => void
  clear: () => void
  setMenuOpen: (open: boolean) => void
}

export const useStory = create<StoryState>((set) => ({
  active: null,
  revealed: false,
  highlight: null,
  menuOpen: false,
  begin: (id, snapshot) =>
    set({ active: { id, step: 0, snapshot }, revealed: false, highlight: null, menuOpen: false }),
  setStep: (step) => set((s) => (s.active ? { active: { ...s.active, step } } : s)),
  setRevealed: (revealed) => set({ revealed }),
  setHighlight: (highlight) => set({ highlight }),
  clear: () => set({ active: null, revealed: false, highlight: null }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
}))

/** True while a story hides the preset's real result (so labels, tooltips and the table must not show it). */
export const useHidingTruth = (): boolean => useStory((s) => s.active !== null && !s.revealed)

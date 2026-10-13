import { create } from 'zustand'
import { useAppStore } from '@/store/app'

export interface Hover {
  id: string
  /** Pointer position in px, relative to the viewport. */
  x: number
  y: number
}

/** View-only state of the 3D scene. Selection itself lives in the shared app store. */
interface ViewState {
  labels: boolean
  xray: boolean
  spin: boolean
  hover: Hover | null
  /** Bumped to (re)frame the camera for the current selection, e.g. on Reset. */
  viewNonce: number
  toggleLabels: () => void
  toggleXray: () => void
  setSpin: (spin: boolean) => void
  setHover: (hover: Hover | null) => void
  reframe: () => void
}

export const useViewState = create<ViewState>((set) => ({
  labels: true,
  xray: false,
  spin: false,
  hover: null,
  viewNonce: 0,
  toggleLabels: () => set((s) => ({ labels: !s.labels })),
  toggleXray: () => set((s) => ({ xray: !s.xray })),
  setSpin: (spin) => set({ spin }),
  setHover: (hover) => set({ hover }),
  reframe: () => set((s) => ({ viewNonce: s.viewNonce + 1 })),
}))

/** Select a target and fly the camera to it (also re-frames when it is already selected). */
export function focusTarget(id: string): void {
  useAppStore.getState().setSelectedTarget(id)
  useViewState.getState().reframe()
}

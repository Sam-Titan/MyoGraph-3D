import { create } from 'zustand'
import { useAppStore } from '@/store/app'

/** A camera preset resolved from the loaded GLB (see viewPresets.ts). */
export interface ViewPresetInfo {
  id: string
  label: string
  dir: [number, number, number]
  /** Target ids best seen from this preset (derived from their `viewDir` extras). */
  best: string[]
}

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
  /** Target id hovered in the results panel; boosts that node's emissive, never moves the camera. */
  rowHover: string | null
  /** Hidden-by-default context nodes the user can toggle (names read from the GLB extras). */
  toggleableNodes: string[]
  shownNodes: Record<string, boolean>
  /** Supply-area shading on the heart for the selected vessel (user toggle). */
  supply: boolean
  /** Camera direction (target -> camera) from a view preset; null = the selection's own view. */
  viewDirOverride: [number, number, number] | null
  /** Bumped to (re)frame the camera for the current selection, e.g. on Reset. */
  viewNonce: number
  viewPresets: ViewPresetInfo[]
  toggleLabels: () => void
  toggleXray: () => void
  toggleSupply: () => void
  setPresetView: (dir: [number, number, number]) => void
  setSpin: (spin: boolean) => void
  setHover: (hover: Hover | null) => void
  setRowHover: (id: string | null) => void
  reframe: () => void
  setViewPresets: (presets: ViewPresetInfo[]) => void
  setToggleableNodes: (names: string[]) => void
  toggleNode: (name: string) => void
}

export const useViewState = create<ViewState>((set) => ({
  labels: true,
  xray: false,
  spin: false,
  supply: true,
  viewDirOverride: null,
  hover: null,
  rowHover: null,
  toggleableNodes: [],
  shownNodes: {},
  viewNonce: 0,
  viewPresets: [],
  toggleLabels: () => set((s) => ({ labels: !s.labels })),
  toggleXray: () => set((s) => ({ xray: !s.xray })),
  toggleSupply: () => set((s) => ({ supply: !s.supply })),
  setPresetView: (viewDirOverride) => set((s) => ({ viewDirOverride, viewNonce: s.viewNonce + 1 })),
  setSpin: (spin) => set({ spin }),
  setHover: (hover) => set({ hover }),
  setRowHover: (rowHover) => set({ rowHover }),
  reframe: () => set((s) => ({ viewDirOverride: null, viewNonce: s.viewNonce + 1 })),
  setViewPresets: (viewPresets) => set({ viewPresets }),
  setToggleableNodes: (toggleableNodes) =>
    set((s) => (toggleableNodes.join() === s.toggleableNodes.join() ? s : { toggleableNodes })),
  toggleNode: (name) =>
    set((s) => ({ shownNodes: { ...s.shownNodes, [name]: !s.shownNodes[name] } })),
}))

/** Select a target and fly the camera to it (also re-frames when it is already selected). */
export function focusTarget(id: string): void {
  useAppStore.getState().setSelectedTarget(id)
  useViewState.getState().reframe()
}

import { Vector3 } from 'three'
import type { NodeBinding } from './useHeartModel'

/** Anatomical axes in scene space (anterior +Z, patient's left +X, inferior -Y). */
export interface ViewPreset {
  id: 'front' | 'left' | 'under'
  label: string
  axis: Vector3
}

export const VIEW_PRESETS: ViewPreset[] = [
  { id: 'front', label: 'Front', axis: new Vector3(0, 0.35, 1).normalize() },
  { id: 'left', label: 'Left side', axis: new Vector3(1, 0.3, 0).normalize() },
  { id: 'under', label: 'Underside', axis: new Vector3(0, -1, 0.3).normalize() },
]

/** A vessel counts as "best seen" from a preset when its own view direction is this close to the axis. */
const BEST_DOT = 0.7

/** Vessels (by target id) whose configured `viewDir` points along the preset's axis. */
export function bestVessels(preset: ViewPreset, bindings: NodeBinding[]): string[] {
  return bindings
    .filter(
      (b) => b.target?.role === 'vessel' && b.viewDir && b.viewDir.dot(preset.axis) >= BEST_DOT,
    )
    .flatMap((b) => (b.target ? [b.target.id] : []))
}

/**
 * Camera direction for a preset: the best-seen vessel's own `viewDir` (so "Left side" frames the
 * same angle as selecting that vessel) when there is exactly one, otherwise the plain axis.
 */
export function presetDir(preset: ViewPreset, bindings: NodeBinding[]): [number, number, number] {
  const best = bindings.filter(
    (b) => b.target?.role === 'vessel' && b.viewDir && b.viewDir.dot(preset.axis) >= BEST_DOT,
  )
  const d = best.length === 1 && best[0].viewDir ? best[0].viewDir : preset.axis
  return [d.x, d.y, d.z]
}

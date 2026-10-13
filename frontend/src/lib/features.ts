import type { FeatureInfo, GroupInfo, TargetInfo } from '@/api/client'

/** Derived features (e.g. BMI) are computed server-side: shown read-only, never as inputs. */
export const isDerived = (f: FeatureInfo): boolean => f.kind === 'derived'

export function splitFeatures(features: FeatureInfo[]): {
  inputs: FeatureInfo[]
  derived: FeatureInfo[]
} {
  return {
    inputs: features.filter((f) => !isDerived(f)),
    derived: features.filter(isDerived),
  }
}

export interface FeatureGroup {
  group: GroupInfo
  inputs: FeatureInfo[]
  derived: FeatureInfo[]
}

/** Features bucketed by group, in the group order given by the API; empty groups are dropped. */
export function groupFeatures(features: FeatureInfo[], groups: GroupInfo[]): FeatureGroup[] {
  return groups
    .map((group) => {
      const members = features.filter((f) => f.group === group.id)
      return { group, ...splitFeatures(members) }
    })
    .filter((g) => g.inputs.length + g.derived.length > 0)
}

/** The target the whole-heart (non-vessel) model predicts; default selection. */
export const overallTarget = (targets: TargetInfo[]): TargetInfo | undefined =>
  targets.find((t) => t.role === 'overall')

export const vesselTargets = (targets: TargetInfo[]): TargetInfo[] =>
  targets.filter((t) => t.role === 'vessel')

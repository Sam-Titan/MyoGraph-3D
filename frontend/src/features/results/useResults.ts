import { useFeatures, usePredict } from '@/api/queries'
import { usePresetTruth } from '@/features/patient/usePresetTruth'
import { overallTarget, vesselTargets } from '@/lib/features'
import { useAppStore } from '@/store/app'

/** Everything the results panels share: targets, the live prediction and the unedited preset truth. */
export function useResults() {
  const features = useFeatures()
  const predictValues = useAppStore((s) => s.predictValues)
  const predict = usePredict(predictValues)
  const selected = useAppStore((s) => s.selectedTarget)
  const setSelected = useAppStore((s) => s.setSelectedTarget)
  const { truth, edited } = usePresetTruth()
  const targets = features.data?.targets ?? []
  return {
    features,
    predict,
    selected,
    setSelected,
    // Truth only applies to the preset as loaded; once edited it no longer describes the patient.
    truth: edited ? null : truth,
    presetEdited: edited,
    overall: overallTarget(targets),
    vessels: vesselTargets(targets),
  }
}

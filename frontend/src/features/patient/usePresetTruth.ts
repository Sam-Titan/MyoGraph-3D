import { usePresets } from '@/api/queries'
import { useHidingTruth } from '@/features/story/useStory'
import { useAppStore } from '@/store/app'

/** The loaded preset's actual catheterisation labels; `edited` once the patient was changed. */
export function usePresetTruth(): { truth: Record<string, boolean> | null; edited: boolean } {
  const { data } = usePresets()
  const id = useAppStore((s) => s.selectedPresetId)
  const edited = useAppStore((s) => s.presetEdited)
  const hiding = useHidingTruth() // a story keeps the real result hidden until its reveal step
  const truth = hiding ? null : (data?.find((p) => p.id === id)?.truth ?? null)
  return { truth, edited: truth !== null && edited }
}

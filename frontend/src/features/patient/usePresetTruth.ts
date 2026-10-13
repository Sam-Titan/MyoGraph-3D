import { usePresets } from '@/api/queries'
import { useAppStore } from '@/store/app'

/** The loaded preset's actual catheterisation labels; `edited` once the patient was changed. */
export function usePresetTruth(): { truth: Record<string, boolean> | null; edited: boolean } {
  const { data } = usePresets()
  const id = useAppStore((s) => s.selectedPresetId)
  const edited = useAppStore((s) => s.presetEdited)
  const truth = data?.find((p) => p.id === id)?.truth ?? null
  return { truth, edited: truth !== null && edited }
}

import type { FormValues } from '@/features/patient/formSchema'

/** What story mode needs from the patient form (which owns react-hook-form). */
export interface PatientBridge {
  getValues: () => FormValues
  /** `keepDefaults` keeps the loaded preset as the baseline, so "edited" is restored too. */
  reset: (values: FormValues, keepDefaults?: boolean) => void
  presetValues: (presetId: string) => FormValues | null
}

let bridge: PatientBridge | null = null

/** Called by PatientForm; returns the cleanup. */
export function registerPatientBridge(b: PatientBridge): () => void {
  bridge = b
  return () => {
    if (bridge === b) bridge = null
  }
}

export const getPatientBridge = (): PatientBridge | null => bridge

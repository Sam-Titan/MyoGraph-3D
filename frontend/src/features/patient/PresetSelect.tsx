import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import type { FeatureInfo } from '@/api/client'
import { useFeatures, usePresets } from '@/api/queries'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useHidingTruth } from '@/features/story/useStory'
import { track } from '@/lib/analytics'
import { vesselTargets } from '@/lib/features'
import { useAppStore } from '@/store/app'
import { defaultValues, type FormValues, valuesForPreset } from './formSchema'

const CUSTOM = '__custom__'

/** The first preset is auto-loaded once per page load, not again after the user picks Custom. */
let autoLoaded = false

/** Loading a preset replaces every input (and the truth labels used for the cath-result column). */
export function PresetSelect({ features }: { features: FeatureInfo[] }) {
  const { reset } = useFormContext<FormValues>()
  const { data: presets = [], isError, isSuccess } = usePresets()
  const targets = useFeatures().data?.targets
  const selected = useAppStore((s) => s.selectedPresetId)
  const edited = useAppStore((s) => s.presetEdited)
  const setSelected = useAppStore((s) => s.setSelectedPresetId)
  const setEdited = useAppStore((s) => s.setPresetEdited)
  const setSettled = useAppStore((s) => s.setPresetSettled)

  // Preset names such as "No CAD" state the real result, so a story shows a neutral name until its reveal step.
  const hiding = useHidingTruth()
  const items = [
    { value: CUSTOM, label: 'Custom (typical values)' },
    ...presets.map((p) => ({
      value: p.id,
      label: hiding && p.id === selected ? 'Hold-out patient (story)' : p.label,
    })),
  ]

  // First impression: the hold-out patient with every vessel stenotic (picked by truth labels,
  // never by id), else the first preset.
  useEffect(() => {
    // No preset to wait for: live predict starts on the form's typical values.
    if (isError || (isSuccess && presets.length === 0)) return setSettled(true)
    // Presets that arrive late (after a failure) must not overwrite what the visitor already typed.
    if (useAppStore.getState().presetSettled || autoLoaded || presets.length === 0 || !targets)
      return
    autoLoaded = true
    const vessels = vesselTargets(targets)
    const preset =
      presets.find((p) => vessels.length > 0 && vessels.every((v) => p.truth[v.id] === true)) ??
      presets[0]
    reset(valuesForPreset(preset, features))
    setSelected(preset.id)
    setEdited(false)
    setSettled(true)
    track('preset_loaded', { preset: preset.id, source: 'auto' })
  }, [presets, targets, features, reset, setSelected, setEdited, setSettled, isError, isSuccess])

  function onChange(value: string | null) {
    if (value === null) return
    const preset = presets.find((p) => p.id === value)
    reset(preset ? valuesForPreset(preset, features) : defaultValues(features))
    setSelected(preset ? preset.id : null)
    setEdited(false)
    if (preset) track('preset_loaded', { preset: preset.id, source: 'user' })
  }

  const current = presets.find((p) => p.id === selected)
  return (
    <div className="space-y-1.5">
      <Label htmlFor="preset-select" className="text-sm font-medium">
        Hold-out patient
      </Label>
      <Select items={items} value={selected ?? CUSTOM} onValueChange={onChange}>
        <SelectTrigger id="preset-select" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isError && (
        <p className="text-xs text-destructive">
          Couldn’t load the hold-out patients. Reload the page, or enter values by hand.
        </p>
      )}
      {current && !edited && (
        <p className="t-meta" title={hiding ? undefined : current.description}>
          Showing a hold-out patient. Choose another or edit any value.
        </p>
      )}
    </div>
  )
}

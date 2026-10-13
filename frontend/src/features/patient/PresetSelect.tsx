import { useFormContext } from 'react-hook-form'
import type { FeatureInfo } from '@/api/client'
import { usePresets } from '@/api/queries'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app'
import { defaultValues, type FormValues, valuesForPreset } from './formSchema'

const CUSTOM = '__custom__'

/** Loading a preset replaces every input (and the truth labels used for the actual-vs-predicted view). */
export function PresetSelect({ features }: { features: FeatureInfo[] }) {
  const { reset } = useFormContext<FormValues>()
  const { data: presets = [], isError } = usePresets()
  const selected = useAppStore((s) => s.selectedPresetId)
  const setSelected = useAppStore((s) => s.setSelectedPresetId)
  const setEdited = useAppStore((s) => s.setPresetEdited)

  const items = [
    { value: CUSTOM, label: 'Custom (typical values)' },
    ...presets.map((p) => ({ value: p.id, label: p.label })),
  ]

  function onChange(value: string | null) {
    if (value === null) return
    const preset = presets.find((p) => p.id === value)
    reset(preset ? valuesForPreset(preset, features) : defaultValues(features))
    setSelected(preset ? preset.id : null)
    setEdited(false)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="preset-select" className="label-caps">
        Hold-out patient preset
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
      {isError && <p className="text-xs text-destructive">Couldn’t load presets.</p>}
      {selected && (
        <p className="text-xs text-muted-foreground">
          {presets.find((p) => p.id === selected)?.description}
        </p>
      )}
    </div>
  )
}

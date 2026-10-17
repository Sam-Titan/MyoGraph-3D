import { Eye, EyeOff, Layers, Orbit, Rotate3d, ScanSearch, Spline, Tags } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import { focusTarget, useViewState } from './useViewState'

const BTN =
  'border-white/15 bg-white/10 text-viewport-foreground hover:bg-white/20 hover:text-white aria-pressed:border-white/50 aria-pressed:bg-white/25'

function Tool({
  label,
  pressed,
  onClick,
  children,
  iconOnlyOnPhone = false,
}: {
  label: string
  pressed?: boolean
  /** Phones: show the icon only (the label stays as accessible name and tooltip) to keep the bar to ~2 rows. */
  iconOnlyOnPhone?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={BTN}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
      <span className={iconOnlyOnPhone ? 'max-sm:sr-only' : undefined}>{label}</span>
    </Button>
  )
}

/** Reset, view presets, Labels, X-ray, Supply area, Spin. `overallId` is the target Reset returns the selection to. */
export function Toolbar({ overallId }: { overallId: string | null }) {
  const { labels, xray, spin, supply, toggleLabels, toggleXray, toggleSupply, setSpin, reframe } =
    useViewState()
  const viewPresets = useViewState((s) => s.viewPresets)
  const setPresetView = useViewState((s) => s.setPresetView)
  const toggleableNodes = useViewState((s) => s.toggleableNodes)
  const shownNodes = useViewState((s) => s.shownNodes)
  const toggleNode = useViewState((s) => s.toggleNode)
  return (
    <div role="toolbar" aria-label="3D view controls" className="flex flex-wrap gap-1.5">
      <Tool
        label="Reset"
        iconOnlyOnPhone
        onClick={() => {
          track('view_toggled', { control: 'reset' })
          if (overallId) focusTarget(overallId)
          else reframe()
        }}
      >
        <ScanSearch />
      </Tool>
      {viewPresets.map((v) => (
        <Tool
          key={v.id}
          label={v.label}
          onClick={() => {
            track('view_toggled', { control: v.id })
            setPresetView(v.dir)
          }}
        >
          <Rotate3d />
        </Tool>
      ))}
      <Tool
        label="Labels"
        iconOnlyOnPhone
        pressed={labels}
        onClick={() => {
          track('view_toggled', { control: 'labels' })
          toggleLabels()
        }}
      >
        <Tags />
      </Tool>
      <Tool
        label="X-ray"
        iconOnlyOnPhone
        pressed={xray}
        onClick={() => {
          track('view_toggled', { control: 'xray' })
          toggleXray()
        }}
      >
        {xray ? <Eye /> : <EyeOff />}
      </Tool>
      <Tool
        label="Supply area"
        iconOnlyOnPhone
        pressed={supply}
        onClick={() => {
          track('view_toggled', { control: 'supply' })
          toggleSupply()
        }}
      >
        <Layers />
      </Tool>
      <Tool
        label="Spin"
        iconOnlyOnPhone
        pressed={spin}
        onClick={() => {
          track('view_toggled', { control: 'spin' })
          setSpin(!spin)
        }}
      >
        <Orbit />
      </Tool>
      {toggleableNodes.map((name) => (
        <Tool
          key={name}
          label={name.charAt(0).toUpperCase() + name.slice(1)}
          iconOnlyOnPhone
          pressed={Boolean(shownNodes[name])}
          onClick={() => {
            track('view_toggled', { control: name })
            toggleNode(name)
          }}
        >
          <Spline />
        </Tool>
      ))}
    </div>
  )
}

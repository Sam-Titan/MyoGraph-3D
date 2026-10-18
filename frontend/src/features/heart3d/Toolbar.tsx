import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Orbit,
  Rotate3d,
  ScanSearch,
  Spline,
  Tags,
} from 'lucide-react'
import { type ReactNode, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import { useOverflowArrows } from './useOverflowArrows'
import { focusTarget, useViewState } from './useViewState'

const BTN =
  'shrink-0 pointer-coarse:h-11 pointer-coarse:min-w-11 border-white/15 bg-white/10 text-viewport-foreground hover:bg-white/20 hover:text-white aria-pressed:border-white/50 aria-pressed:bg-white/25'

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
  const scroller = useRef<HTMLDivElement>(null)
  const { overflowing, canPrev, canNext, scrollByPage } = useOverflowArrows(scroller)
  return (
    <div className="flex min-w-0 items-center gap-1">
      {overflowing && <ArrowButton dir={-1} disabled={!canPrev} onClick={() => scrollByPage(-1)} />}
      <div
        ref={scroller}
        role="toolbar"
        aria-label="3D view controls"
        style={fadeMask(canPrev, canNext)}
        className="flex min-w-0 snap-x snap-proximity scroll-px-1 gap-1.5 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:snap-start"
      >
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
      {overflowing && <ArrowButton dir={1} disabled={!canNext} onClick={() => scrollByPage(1)} />}
    </div>
  )
}

function ArrowButton({
  dir,
  disabled,
  onClick,
}: {
  dir: -1 | 1
  disabled: boolean
  onClick: () => void
}) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={`${BTN} pointer-coarse:size-11`}
      aria-label={dir < 0 ? 'Scroll view controls left' : 'Scroll view controls right'}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon />
    </Button>
  )
}

/** Fades only the edge that still has hidden content, so the first/last button (and its focus ring) stays unmasked. */
function fadeMask(canPrev: boolean, canNext: boolean) {
  if (!canPrev && !canNext) return undefined
  const left = canPrev ? 'transparent 0, #000 20px' : '#000 0, #000 0'
  const right = canNext ? '#000 calc(100% - 20px), transparent 100%' : '#000 100%, #000 100%'
  const image = `linear-gradient(to right, ${left}, ${right})`
  return { maskImage: image, WebkitMaskImage: image }
}

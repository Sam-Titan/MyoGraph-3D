import { Eye, EyeOff, Orbit, ScanSearch, Tags } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { focusTarget, useViewState } from './useViewState'

const BTN =
  'border-white/15 bg-white/10 text-viewport-foreground hover:bg-white/20 hover:text-white aria-pressed:border-white/50 aria-pressed:bg-white/25'

function Tool({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button variant="outline" size="sm" className={BTN} aria-pressed={pressed} onClick={onClick}>
      {children}
      {label}
    </Button>
  )
}

/** Reset, Labels, X-ray, Spin. `overallId` is the target Reset returns the selection to. */
export function Toolbar({ overallId }: { overallId: string | null }) {
  const { labels, xray, spin, toggleLabels, toggleXray, setSpin, reframe } = useViewState()
  return (
    <div role="toolbar" aria-label="3D view controls" className="flex flex-wrap gap-1.5">
      <Tool
        label="Reset"
        onClick={() => {
          if (overallId) focusTarget(overallId)
          else reframe()
        }}
      >
        <ScanSearch />
      </Tool>
      <Tool label="Labels" pressed={labels} onClick={toggleLabels}>
        <Tags />
      </Tool>
      <Tool label="X-ray" pressed={xray} onClick={toggleXray}>
        {xray ? <Eye /> : <EyeOff />}
      </Tool>
      <Tool label="Spin" pressed={spin} onClick={() => setSpin(!spin)}>
        <Orbit />
      </Tool>
    </div>
  )
}

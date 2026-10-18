import { Pin, PinOff } from 'lucide-react'
import { useIntervals, usePredict } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import { makePin } from './pinModel'

/**
 * “Pin this result” saves the current estimates; edits afterwards show their change against it.
 * Phones show only the button, in the "Model estimates" heading row (`header`); the row below the
 * heading then only appears while pinned, as the explanation.
 */
export function PinButton({ header = false }: { header?: boolean }) {
  const pinned = useAppStore((s) => s.pinned)
  const setPinned = useAppStore((s) => s.setPinned)
  const values = useAppStore((s) => s.predictValues)
  const intervalValues = useAppStore((s) => s.intervalValues)
  const predict = usePredict(values)
  const intervals = useIntervals(intervalValues)
  // Pin the point estimates together with their ranges, so wait until both describe the same values
  // (a failed ranges request also counts as settled: the pin then carries no range).
  const ready =
    Boolean(predict.data) &&
    !predict.isPlaceholderData &&
    values === intervalValues &&
    !intervals.isFetching
  const pin = () => {
    const probabilities = Object.fromEntries(
      Object.entries(predict.data?.targets ?? {}).map(([id, t]) => [id, t.probability]),
    )
    setPinned(makePin(probabilities, intervals.data?.targets))
  }
  const phoneOnly = header ? '' : 'max-md:hidden'
  const button = pinned ? (
    <Button
      variant="outline"
      size="sm"
      className={cn('pointer-coarse:h-11', phoneOnly)}
      onClick={() => setPinned(null)}
    >
      <PinOff /> Unpin
    </Button>
  ) : (
    <Button
      variant="outline"
      size="sm"
      disabled={!ready}
      onClick={pin}
      className={cn('min-w-36 pointer-coarse:h-11', phoneOnly)}
    >
      <Pin /> {ready || predict.isError ? 'Pin this result' : 'Waiting for ranges…'}
    </Button>
  )
  if (header) return button
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 max-md:justify-end',
        !pinned && 'max-md:hidden',
      )}
    >
      <p className="t-meta">
        {pinned
          ? 'Pinned. Edits now show their change against the pinned estimates.'
          : 'Pin these estimates to see what a change does.'}
      </p>
      {button}
    </div>
  )
}

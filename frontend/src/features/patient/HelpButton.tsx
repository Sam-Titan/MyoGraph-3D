import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** The “i” beside an input's label: what it is and where to find it, in plain words. */
export function HelpButton({ label, help }: { label: string; help: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${label}`}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent>
        <p className="font-medium text-foreground">{label}</p>
        <p className="mt-1 text-muted-foreground">{help}</p>
      </PopoverContent>
    </Popover>
  )
}

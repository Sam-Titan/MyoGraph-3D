import { Popover } from '@base-ui/react/popover'
import { Fragment, type ReactNode, useMemo } from 'react'
import type { DisplayConfig } from '@/api/client'
import { useDisplay } from '@/api/queries'

type Entry = DisplayConfig['glossary'][number]

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One alternation over every glossary `match`, longest first so "ejection fraction" beats "fraction". */
export function glossaryPattern(glossary: Entry[]): RegExp | null {
  const words = glossary.flatMap((g) => g.match).sort((a, b) => b.length - a.length)
  if (words.length === 0) return null
  return new RegExp(`(?<![\\w-])(${words.map(escapeRegex).join('|')})(?![\\w-])`, 'gi')
}

/** Acronyms (any capital after the first letter) must match case-exactly; words match any case. */
const caseOk = (match: string, term: string): boolean =>
  /[A-Z]/.test(term.slice(1)) ? match === term : match.toLowerCase() === term.toLowerCase()

/** Splits `text` into plain strings and glossary hits (first hit per entry only). */
export function splitGlossary(
  text: string,
  glossary: Entry[],
): (string | { entry: Entry; shown: string })[] {
  const re = glossaryPattern(glossary)
  if (!re) return [text]
  const out: (string | { entry: Entry; shown: string })[] = []
  const seen = new Set<string>()
  let last = 0
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0
    const entry = glossary.find((g) => g.match.some((w) => caseOk(m[0], w)))
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    if (at > last) out.push(text.slice(last, at))
    out.push({ entry, shown: m[0] })
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Term({ entry, children }: { entry: Entry; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        data-glossary={entry.id}
        className="cursor-help rounded-sm underline decoration-dotted decoration-muted-foreground underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-50">
          <Popover.Popup className="max-w-64 rounded-md border bg-popover px-3 py-2 text-xs font-normal leading-snug text-popover-foreground shadow-md">
            {entry.text}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Plain text in which known jargon gets a tap / hover / focus explanation (config/display.yaml). */
export function GlossaryText({ text }: { text: string }) {
  const { data } = useDisplay()
  const parts = useMemo(() => (data ? splitGlossary(text, data.glossary) : [text]), [data, text])
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
          <Fragment key={i}>{p}</Fragment>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
          <Term key={i} entry={p.entry}>
            {p.shown}
          </Term>
        ),
      )}
    </>
  )
}

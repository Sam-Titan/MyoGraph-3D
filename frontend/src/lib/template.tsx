import { Fragment, type ReactNode } from 'react'

const SLOT = /\{(\w+)\}/g

/** Fills `{name}` slots with strings; an unknown slot stays visible so a typo is never silent. */
export function fillText(template: string, vars: Record<string, string | number>): string {
  return template.replace(SLOT, (all, name: string) => (name in vars ? String(vars[name]) : all))
}

/** Like `fillText`, but a slot may be any node (a tweened number, a glossary term). */
export function fillTemplate(template: string, vars: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = []
  let last = 0
  for (const m of template.matchAll(SLOT)) {
    const at = m.index ?? 0
    if (at > last) out.push(template.slice(last, at))
    const name = m[1]
    out.push(<Fragment key={`${at}-${name}`}>{name in vars ? vars[name] : m[0]}</Fragment>)
    last = at + m[0].length
  }
  if (last < template.length) out.push(template.slice(last))
  return out
}

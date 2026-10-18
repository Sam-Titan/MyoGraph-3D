/** DOM elements of one vessel's label: the chip, plus its leader line and anchor dot in the SVG overlay. */
export interface LabelEls {
  chip: HTMLButtonElement | null
  line: SVGLineElement | null
  dot: SVGCircleElement | null
}

/** Shared between LabelChips (renders the DOM) and LabelSync (positions it every frame, no re-render). */
export type LabelRegistry = Map<string, LabelEls>

export const getEls = (reg: LabelRegistry, id: string): LabelEls => {
  let e = reg.get(id)
  if (!e) {
    e = { chip: null, line: null, dot: null }
    reg.set(id, e)
  }
  return e
}

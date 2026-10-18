import { type ReactNode, useState } from 'react'
import { createPortal } from 'react-dom'
import { PatientPanel } from './PatientPanel'

/**
 * One PatientForm for the whole session, whichever slot shows it. The form owns live prediction and
 * the story bridge, so it must never unmount or duplicate when the layout switches between the
 * inline column (wide) and the bottom sheet (narrow). React renders it into a detached host node;
 * `PatientSlot` moves that node into the visible place, which keeps the form state.
 */
export function usePatientHost(): { host: HTMLDivElement; portal: ReactNode } {
  const [host] = useState(() => {
    const el = document.createElement('div')
    el.className = 'min-w-0'
    return el
  })
  return { host, portal: createPortal(<PatientPanel />, host) }
}

export function PatientSlot({ host }: { host: HTMLDivElement }) {
  return (
    <div
      ref={(el) => {
        if (el && host.parentElement !== el) el.appendChild(host)
      }}
    />
  )
}

import { useEffect, useRef, type ReactNode } from 'react'
import { Collapsible } from '@three-flatland/design-system'
import { useEncodeStore, type InfoSectionKey } from './encodeStore'

// Wraps the design-system Collapsible to make it controlled by the store.
// The Lit element fires `vsc-collapsible-toggle` (a CustomEvent with
// `detail: { open: boolean }`); @lit/react's wrapper does NOT surface
// custom events as React props for this primitive, so we attach the
// listener via ref. The `open` prop drives the visible state from the
// store; the listener writes user intent back.

export interface InfoSectionProps {
  id: InfoSectionKey
  heading: string
  children: ReactNode
}

export function InfoSection({ id, heading, children }: InfoSectionProps) {
  const open = useEncodeStore((s) => s.infoSections[id])
  const setInfoSection = useEncodeStore((s) => s.setInfoSection)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onToggle = (e: Event) => {
      const detail = (e as CustomEvent<{ open: boolean }>).detail
      setInfoSection(id, detail.open)
    }
    el.addEventListener('vsc-collapsible-toggle', onToggle)
    return () => el.removeEventListener('vsc-collapsible-toggle', onToggle)
  }, [id, setInfoSection])

  return (
    <Collapsible ref={ref} heading={heading} open={open}>
      {children}
    </Collapsible>
  )
}

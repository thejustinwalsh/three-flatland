import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react'
import { Collapsible } from '@three-flatland/design-system'
import { normalBakerActions, useNormalBakerStore, type InfoSectionKey } from './normalBakerStore'

// Wraps the design-system Collapsible to make it controlled by the store
// (open state persisted cross-session). Same shape as the encode tool's
// InfoSection: the Lit element fires `vsc-collapsible-toggle` (a
// CustomEvent with `detail: { open: boolean }`); @lit/react's wrapper
// does NOT surface custom events as React props for this primitive, so
// we attach the listener via ref. The `open` prop drives the visible
// state from the store; the listener writes user intent back.

export interface InfoSectionProps {
  id: InfoSectionKey
  heading: string
  children: ReactNode
}

export function InfoSection({ id, heading, children }: InfoSectionProps) {
  const open = useNormalBakerStore((s) => s.infoSections[id])
  const ref = useRef<ComponentRef<typeof Collapsible>>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onToggle = (e: Event) => {
      const detail = (e as CustomEvent<{ open: boolean }>).detail
      normalBakerActions.setInfoSection(id, detail.open)
    }
    el.addEventListener('vsc-collapsible-toggle', onToggle)
    return () => el.removeEventListener('vsc-collapsible-toggle', onToggle)
  }, [id])

  return (
    <Collapsible ref={ref} heading={heading} open={open}>
      {children}
    </Collapsible>
  )
}

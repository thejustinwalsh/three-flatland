import { useEffect, useRef } from 'react'
import { createPane } from '../create-pane.js'
import type { CreatePaneOptions, PaneBundle } from '../create-pane.js'

/**
 * Create a themed Tweakpane instance. Disposes on unmount.
 * Returns a stable PaneBundle ref (pane + fpsGraph).
 * The pane is null until the effect runs — access via `.pane`.
 */
export function usePane(options: CreatePaneOptions = {}): PaneBundle {
  const bundleRef = useRef<PaneBundle | null>(null)

  if (bundleRef.current === null) {
    bundleRef.current = createPane(options)
  }

  useEffect(() => {
    return () => {
      bundleRef.current?.pane.dispose()
      bundleRef.current = null
    }
  }, [])

  return bundleRef.current
}

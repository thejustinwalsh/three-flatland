import { useEffect, useRef } from 'react'
import { createPane } from '../create-pane.js'
import type { CreatePaneOptions, PaneBundle } from '../create-pane.js'

/**
 * Create a themed Tweakpane instance. Disposes on unmount.
 * Returns a stable PaneBundle (pane + stats).
 */
export function usePane(options: CreatePaneOptions = {}): PaneBundle {
  const bundleRef = useRef<PaneBundle | null>(null)
  const mountedRef = useRef(false)

  if (bundleRef.current === null) {
    bundleRef.current = createPane(options)
  }

  useEffect(() => {
    mountedRef.current = true

    // If strict mode disposed the pane in a previous cleanup,
    // recreate it now
    if (bundleRef.current === null) {
      bundleRef.current = createPane(options)
    }

    return () => {
      // Use setTimeout to distinguish strict mode cleanup (sync re-mount)
      // from real unmount (component gone). Strict mode re-runs effects
      // synchronously, so the timeout fires after the re-mount.
      const bundle = bundleRef.current
      setTimeout(() => {
        if (!mountedRef.current && bundle) {
          bundle.pane.dispose()
        }
      }, 0)
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return bundleRef.current!
}

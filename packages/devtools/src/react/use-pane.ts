import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { claimPane, createPane } from '../create-pane.js'
import type { CreatePaneOptions, PaneBundle } from '../create-pane.js'

/**
 * High `useFrame` priority — positive numbers run AFTER R3F's own
 * auto-render, and larger numbers run later among registered frame
 * callbacks. This drives the stats graph after everything else in the
 * frame has had a chance to update `renderer.info`, so the sample we
 * push is the true end-of-frame state.
 */
const LATE_FRAME_PRIORITY = 1000

/**
 * Create a themed Tweakpane instance. Disposes on unmount. Returns a
 * stable `PaneBundle` (pane + `update`).
 *
 * The graph is driven by R3F's `useFrame` at a late priority so the
 * stats sample we read is post-render. Internally forces
 * `driver: 'manual'` — a secondary `requestAnimationFrame` would
 * double-tick under R3F (and Safari throttles multi-rAF pages), so we
 * piggy-back on R3F's single loop instead.
 */
export function usePane(options: CreatePaneOptions = {}): PaneBundle {
  const bundleRef = useRef<PaneBundle | null>(null)
  const mountedRef = useRef(false)

  if (bundleRef.current === null) {
    bundleRef.current = createPane({ ...options, driver: 'manual' })
  }

  // Note: R3F deprecated the positional-priority signature. The
  // options object is the canonical form now.
  useFrame(() => {
    bundleRef.current?.update()
  }, { priority: LATE_FRAME_PRIORITY })

  useEffect(() => {
    mountedRef.current = true

    // Strict mode may have disposed the pane in the previous cleanup
    // pass — recreate if so.
    if (bundleRef.current === null) {
      bundleRef.current = createPane({ ...options, driver: 'manual' })
    }

    // Claim the pane so a later createPane in an unrelated component
    // doesn't dispose it.
    claimPane(bundleRef.current)

    return () => {
      // Strict mode cleans up synchronously then re-mounts. Defer the
      // dispose check one microtask so the re-mount can cancel it.
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

  return bundleRef.current
}

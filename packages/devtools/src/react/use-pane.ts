import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { claimPane, createPane } from '../create-pane.js'
import type { CreatePaneOptions, PaneBundle } from '../create-pane.js'

/**
 * Create a themed Tweakpane instance. Disposes on unmount. Returns a
 * stable `PaneBundle` (pane + `update`).
 *
 * The graph is driven by R3F's `useFrame` so we share one rAF with
 * the host. Default phase / priority on purpose — the pane's
 * `update()` only repaints from the (already-current) bus state, so
 * sampling timing is irrelevant. Setting a positive priority would
 * otherwise collide with the example's `useFrame(..., { phase:
 * 'render' })` callback under StrictMode's mount → cleanup → remount,
 * surfacing as `[useFrame] Job with id "..." already exists, replacing`.
 *
 * Internally forces `driver: 'manual'` — a secondary
 * `requestAnimationFrame` would double-tick under R3F (and Safari
 * throttles multi-rAF pages).
 */
export function usePane(options: CreatePaneOptions = {}): PaneBundle {
  const bundleRef = useRef<PaneBundle | null>(null)
  const mountedRef = useRef(false)

  if (bundleRef.current === null) {
    bundleRef.current = createPane({ ...options, driver: 'manual' })
  }

  useFrame(() => {
    bundleRef.current?.update()
  })

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

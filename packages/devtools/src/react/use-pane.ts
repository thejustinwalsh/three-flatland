import { useEffect, useReducer, useRef } from 'react'
import { claimPane, createPane } from '../create-pane.js'
import type { CreatePaneOptions, PaneBundle } from '../create-pane.js'

/**
 * Create a themed Tweakpane instance. Disposes on unmount, recreates on
 * remount. Returns a `PaneBundle` whose identity changes if React tears
 * the component down and rebuilds it (StrictMode, parent remount,
 * Suspense). Child hooks that depend on the pane (`usePaneFolder`,
 * `usePaneInput`) re-bind when this happens.
 *
 * Lifecycle:
 *   - Render: lazy-creates the bundle into a ref so it's available
 *     synchronously on first paint. Render runs twice in StrictMode but
 *     the ref guard prevents double-creation. Orphans from aborted
 *     concurrent renders are reclaimed by `createPane`'s unclaimed-slot
 *     mechanism.
 *   - Effect: claims the bundle so unrelated `createPane` calls won't
 *     dispose it; cleanup disposes the pane unconditionally.
 *   - Effect re-mount (StrictMode or true remount): the bundle in the
 *     ref is now `disposed`, so we create a fresh one and `force()` a
 *     re-render so consumers receive the new identity.
 *
 * Uses `driver: 'raf'` so the stats graph self-ticks via its own
 * `requestAnimationFrame` loop. This makes `usePane` work regardless
 * of whether it's called inside or outside R3F's `<Canvas>` context.
 */
export function usePane(options: CreatePaneOptions = {}): PaneBundle {
  const optsRef = useRef(options)
  optsRef.current = options

  const bundleRef = useRef<PaneBundle | null>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)

  if (bundleRef.current === null || bundleRef.current.disposed) {
    bundleRef.current = createPane(optsRef.current)
  }

  const bundle = bundleRef.current

  useEffect(() => {
    if (bundle.disposed) {
      bundleRef.current = createPane(optsRef.current)
      force()
      return
    }
    claimPane(bundle)
    return () => {
      bundle.pane.dispose()
    }
  }, [bundle])

  return bundle
}

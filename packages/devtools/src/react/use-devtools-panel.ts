import { useEffect } from 'react'
import type { Pane } from 'tweakpane'
import {
  mountDevtoolsPanel,
  type DevtoolsPanelHandle,
  type MountDevtoolsPanelOptions,
} from '../devtools-panel.js'

/**
 * Mount a devtools panel onto the given pane for the component's
 * lifetime. Disposes the panel + closes the bus subscription on unmount.
 *
 * Call after `usePane()` so the pane reference is stable.
 *
 * @example
 * ```tsx
 * const { pane } = usePane()
 * useDevtoolsPanel(pane)
 * ```
 */
export function useDevtoolsPanel(
  pane: Pane | null,
  options: MountDevtoolsPanelOptions = {},
): void {
  useEffect(() => {
    if (!pane) return
    let handle: DevtoolsPanelHandle | null = null
    try {
      handle = mountDevtoolsPanel(pane, options)
    } catch {
      // Pane may already be disposed during strict-mode double-mount.
    }
    return () => {
      handle?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane])
}

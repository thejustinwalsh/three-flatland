import { useEffect, useRef } from 'react'
import type { PaneParent } from './use-pane-input.js'

/**
 * Add a button to a Tweakpane parent. Uses a ref for the callback to avoid stale closures.
 */
export function usePaneButton(
  parent: PaneParent | null,
  title: string,
  onClick: () => void,
): void {
  const callbackRef = useRef(onClick)
  callbackRef.current = onClick

  useEffect(() => {
    if (!parent) return

    const button = parent.addButton({ title })
    button.on('click', () => callbackRef.current())

    return () => {
      button.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent])
}

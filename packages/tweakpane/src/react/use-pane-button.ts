import { useEffect, useRef } from 'react'
import type { PaneParent } from './use-pane-input.js'

/**
 * Add a button to a Tweakpane parent. Uses a ref for the callback to avoid stale closures.
 * Uses deferred disposal to survive React strict mode.
 */
export function usePaneButton(
  parent: PaneParent | null,
  title: string,
  onClick: () => void,
): void {
  const callbackRef = useRef(onClick)
  callbackRef.current = onClick
  const buttonRef = useRef<{ dispose(): void } | null>(null)
  const mountedRef = useRef(false)

  if (parent && buttonRef.current === null) {
    const button = parent.addButton({ title })
    button.on('click', () => callbackRef.current())
    buttonRef.current = button
  }

  useEffect(() => {
    mountedRef.current = true

    if (parent && buttonRef.current === null) {
      const button = parent.addButton({ title })
      button.on('click', () => callbackRef.current())
      buttonRef.current = button
    }

    return () => {
      const button = buttonRef.current
      setTimeout(() => {
        if (!mountedRef.current && button) {
          button.dispose()
          if (buttonRef.current === button) buttonRef.current = null
        }
      }, 0)
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent])
}

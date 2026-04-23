import { useCallback, useEffect, useState } from 'react'

/**
 * Reacts to an `fl:dev-changed` DOM event dispatched on the window whenever
 * the webview's bundle is rebuilt by the dev task. Returns a tiny state
 * machine the UI can render as a toast: `pending` is true once a change is
 * announced; `reload()` does `location.reload()`; `dismiss()` hides the
 * toast without reloading (useful when the user wants to finish a thought
 * before reloading).
 *
 * Wiring:
 *   1. Extension host: fs.watch dist/webview/<tool> → bridge.emit('dev/reload')
 *   2. Webview main.tsx: bridge.on('dev/reload', () =>
 *          window.dispatchEvent(new Event('fl:dev-changed')))
 *   3. UI: useDevReload() + <DevReloadToast /> or equivalent.
 */
export function useDevReload(): {
  pending: boolean
  reload: () => void
  dismiss: () => void
} {
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const handler = () => setPending(true)
    window.addEventListener('fl:dev-changed', handler)
    return () => window.removeEventListener('fl:dev-changed', handler)
  }, [])

  const reload = useCallback(() => {
    window.location.reload()
  }, [])

  const dismiss = useCallback(() => {
    setPending(false)
  }, [])

  return { pending, reload, dismiss }
}

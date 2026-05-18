import { useLayoutEffect, useRef, useState } from 'react'
import type { FolderApi, FolderParams } from 'tweakpane'
import type { PaneParent } from './use-pane-input.js'

/**
 * Create a Tweakpane folder underneath `parent`. Disposes on unmount and
 * recreates when `parent` (or `title`) changes — e.g., when `usePane`
 * tears down and rebuilds its bundle on a StrictMode remount.
 *
 * Returns `null` on the first render before the layout effect commits,
 * then the FolderApi on the next render. The two renders happen
 * synchronously before paint, so consumers don't see a flicker.
 */
export function usePaneFolder(
  parent: PaneParent | null,
  title: string,
  options: Partial<FolderParams> = {},
): FolderApi | null {
  const optsRef = useRef(options)
  optsRef.current = options

  const [folder, setFolder] = useState<FolderApi | null>(null)

  useLayoutEffect(() => {
    if (!parent) {
      setFolder(null)
      return
    }
    const f = parent.addFolder({ expanded: false, ...optsRef.current, title })
    setFolder(f)
    return () => {
      try {
        f.dispose()
      } catch {
        // Parent may have been disposed first (cascade), in which case
        // the folder is already gone. Ignore.
      }
    }
  }, [parent, title])

  return folder
}

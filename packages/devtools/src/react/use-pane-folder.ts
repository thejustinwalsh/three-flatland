import { useEffect, useRef } from 'react'
import type { FolderApi, FolderParams } from 'tweakpane'
import type { PaneParent } from './use-pane-input.js'

/**
 * Create a Tweakpane folder. Disposes on unmount.
 * Returns the FolderApi (usable as parent for usePaneInput).
 *
 * Created synchronously during render so it's immediately available
 * for child hooks on first render. Uses deferred disposal to survive
 * React strict mode's cleanup/re-mount cycle.
 */
export function usePaneFolder(
  parent: PaneParent | null,
  title: string,
  options: Partial<FolderParams> = {},
): FolderApi | null {
  const folderRef = useRef<FolderApi | null>(null)
  const mountedRef = useRef(false)

  if (parent && folderRef.current === null) {
    folderRef.current = parent.addFolder({ expanded: false, ...options, title })
  }

  useEffect(() => {
    mountedRef.current = true

    if (parent && folderRef.current === null) {
      folderRef.current = parent.addFolder({ expanded: false, ...options, title })
    }

    return () => {
      const folder = folderRef.current
      setTimeout(() => {
        if (!mountedRef.current && folder) {
          folder.dispose()
          if (folderRef.current === folder) folderRef.current = null
        }
      }, 0)
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return parent ? folderRef.current : null
}

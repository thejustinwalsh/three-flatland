import { useEffect, useRef } from 'react'
import type { FolderApi, FolderParams } from 'tweakpane'
import type { PaneParent } from './use-pane-input.js'

/**
 * Create a Tweakpane folder. Disposes on unmount.
 * Returns the FolderApi (usable as parent for usePaneInput).
 */
export function usePaneFolder(
  parent: PaneParent | null,
  title: string,
  options: Partial<FolderParams> = {},
): FolderApi | null {
  const folderRef = useRef<FolderApi | null>(null)

  useEffect(() => {
    if (!parent) return

    const folder = parent.addFolder({ title, ...options })
    folderRef.current = folder

    return () => {
      folder.dispose()
      folderRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent])

  return folderRef.current
}

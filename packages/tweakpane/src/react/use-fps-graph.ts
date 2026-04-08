import { useEffect, useRef } from 'react'
import type { FpsGraphBladeApi } from '@tweakpane/plugin-essentials'
import type { PaneParent } from './use-pane-input.js'

export interface FpsGraphHandle {
  begin: () => void
  end: () => void
}

/**
 * Add an FPS graph blade. Returns { begin, end } for use inside useFrame.
 * If the pane was created with `fps: true` (default), you can skip this hook
 * and use paneBundle.fpsGraph directly.
 */
export function useFpsGraph(parent: PaneParent | null): FpsGraphHandle {
  const graphRef = useRef<FpsGraphBladeApi | null>(null)

  useEffect(() => {
    if (!parent) return

    const graph = parent.addBlade({
      view: 'fpsgraph',
      label: 'fps',
      rows: 2,
    }) as FpsGraphBladeApi

    graphRef.current = graph

    return () => {
      graph.dispose()
      graphRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent])

  return {
    begin: () => graphRef.current?.begin(),
    end: () => graphRef.current?.end(),
  }
}

import { Pane } from 'tweakpane'
import type { FpsGraphBladeApi } from '@tweakpane/plugin-essentials'
import { applyTheme, FLATLAND_THEME } from './theme.js'
import { registerPlugins } from './plugins.js'

export interface CreatePaneOptions {
  /** Custom container element */
  container?: HTMLElement
  /** Pane title (enables collapse) */
  title?: string
  /** Default expansion state */
  expanded?: boolean
  /** Add FPS graph at the top of the pane (default: true) */
  fps?: boolean
}

export interface PaneBundle {
  pane: Pane
  fpsGraph: FpsGraphBladeApi | null
}

/**
 * Create a themed Tweakpane instance with essentials plugin and optional FPS graph.
 */
export function createPane(options: CreatePaneOptions = {}): PaneBundle {
  const { fps = true, ...paneConfig } = options
  const pane = new Pane(paneConfig)

  applyTheme(pane.element, FLATLAND_THEME)
  registerPlugins(pane)

  let fpsGraph: FpsGraphBladeApi | null = null
  if (fps) {
    fpsGraph = pane.addBlade({
      view: 'fpsgraph',
      label: 'fps',
      rows: 2,
    }) as FpsGraphBladeApi
  }

  return { pane, fpsGraph }
}

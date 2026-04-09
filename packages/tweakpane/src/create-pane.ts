import { Pane } from 'tweakpane'
import { applyTheme, FLATLAND_THEME } from './theme.js'
import { registerPlugins } from './plugins.js'
import { addStatsGraph, type StatsGraphHandle } from './stats-graph.js'

export interface CreatePaneOptions {
  /** Custom container element */
  container?: HTMLElement
  /** Pane title (default: 'Controls') */
  title?: string
  /** Default expansion state (default: true) */
  expanded?: boolean
  /** Add stats graph + renderer monitors (default: true) */
  stats?: boolean
}

export interface StatsHandle {
  /** Call at start of frame */
  begin(): void
  /** Call at end of frame */
  end(): void
  /** Update renderer stats — call after render with renderer.info.render */
  update(info: { drawCalls: number; triangles?: number }): void
}

export interface PaneBundle {
  pane: Pane
  /** @deprecated Use stats.begin()/end() instead */
  fpsGraph: null
  stats: StatsHandle
}

/**
 * Create a themed Tweakpane instance with collapsible header and stats.
 *
 * Layout:
 *   [Controls ▾]          ← collapsible pane header
 *   ┌─ FPS/MS/MEM graph ─┐ ← always visible (click to cycle)
 *   ├─ Stats (folder) ───┤ ← collapsible: draws, tris
 *   ├─ ...user controls...┤
 *   └────────────────────┘
 */
export function createPane(options: CreatePaneOptions = {}): PaneBundle {
  const {
    title = 'Controls',
    expanded = true,
    stats: showStats = true,
    ...rest
  } = options

  const pane = new Pane({ title, expanded, ...rest })

  // Ensure pane floats above canvas elements (R3F creates full-viewport divs)
  pane.element.style.zIndex = '1000'

  applyTheme(pane.element, FLATLAND_THEME)
  registerPlugins(pane)

  let graph: StatsGraphHandle | null = null
  const rendererParams = { draws: 0, tris: 0 }
  let rafId = 0

  if (showStats) {
    // Stats graph at the top of the pane (not inside a folder)
    graph = addStatsGraph(pane)

    // Collapsible stats folder for renderer info
    const statsFolder = pane.addFolder({ title: 'Stats', expanded: false })
    statsFolder.addBinding(rendererParams, 'draws', {
      readonly: true,
      format: (v: number) => v.toFixed(0),
    })
    statsFolder.addBinding(rendererParams, 'tris', {
      readonly: true,
      format: (v: number) => v.toFixed(0),
    })

    // RAF-based refresh for stat monitors
    const refresh = () => {
      statsFolder.refresh()
      rafId = requestAnimationFrame(refresh)
    }
    rafId = requestAnimationFrame(refresh)
  }

  // Clean up on dispose
  const originalDispose = pane.dispose.bind(pane)
  pane.dispose = () => {
    if (rafId) cancelAnimationFrame(rafId)
    graph?.dispose()
    originalDispose()
  }

  const stats: StatsHandle = {
    begin() {
      graph?.begin()
    },
    end() {
      graph?.end()
    },
    update(info) {
      rendererParams.draws = info.drawCalls
      if (info.triangles !== undefined) {
        rendererParams.tris = info.triangles
      }
    },
  }

  return { pane, fpsGraph: null, stats }
}

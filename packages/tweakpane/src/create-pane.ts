import { Pane } from 'tweakpane'
import type { Scene } from 'three'
import { applyTheme, FLATLAND_THEME } from './theme.js'
import { registerPlugins } from './plugins.js'
import { addStatsGraph, type StatsGraphHandle } from './stats-graph.js'
import { addStatsRow, type StatsRowHandle } from './stats-row.js'

/** Minimal shape of a three.js-ish renderer exposed inside `scene.onAfterRender`. */
interface StatsRenderer {
  info?: {
    render?: {
      drawCalls: number
      triangles: number
      lines: number
      points: number
      calls: number
      frameCalls: number
      /** GPU frame time in ms, populated after `resolveTimestampsAsync` resolves. */
      timestamp?: number
    }
    memory?: {
      geometries: number
      textures: number
    }
  }
  backend?: {
    /** `true` when the backend was constructed with `{ trackTimestamp: true }` and the adapter supports it. */
    trackTimestamp?: boolean
  }
  /** Fire-and-forget — triggers async readback of the GPU timestamp query pool. */
  resolveTimestampsAsync?(type: 'render' | 'compute'): Promise<number | undefined>
}

export interface CreatePaneOptions {
  /** Custom container element */
  container?: HTMLElement
  /** Pane title (default: 'Controls') */
  title?: string
  /** Default expansion state (default: true) */
  expanded?: boolean
  /** Add stats graph + renderer monitors (default: true) */
  stats?: boolean
  /**
   * Three.js `Scene` to wire for automatic per-frame draw/triangle stats.
   *
   * When provided, `createPane` hooks `scene.onAfterRender` to capture
   * `renderer.info.render.drawCalls` / `triangles` at the exact moment
   * they're valid — inside `renderer.render()`, after the draw has been
   * recorded and before three.js's internal `info.reset()` fires next
   * frame. You no longer need to call `stats.update()` manually.
   *
   * Works for both vanilla three.js (`renderer.setAnimationLoop`) and R3F
   * v10 (whose phase-based scheduler reads `info.render` out-of-band with
   * three.js's auto-reset).
   */
  scene?: Scene
}

/**
 * Shape of what can be pushed into the stats panel. Mirrors the subset of
 * `renderer.info` we surface in the Stats folder. All fields are optional
 * so callers can pass just `drawCalls` + `triangles` or the full set.
 */
export interface StatsUpdate {
  drawCalls?: number
  triangles?: number
  lines?: number
  points?: number
  geometries?: number
  textures?: number
}

export interface StatsHandle {
  /** Call at start of frame */
  begin(): void
  /** Call at end of frame */
  end(): void
  /** Push renderer stats into the pane. Missing fields are left unchanged. */
  update(info: StatsUpdate): void
}

export interface PaneBundle {
  pane: Pane
  /** @deprecated Use stats.begin()/end() instead */
  fpsGraph: null
  stats: StatsHandle
}

/**
 * Module-level "unclaimed pane" slot.
 *
 * React 18+ with StrictMode and Suspense can render a component multiple
 * times before the first effect commits (each aborted render discards its
 * `useRef` slots, including `bundleRef`). Because `new Pane()` mounts a
 * wrapper element to `document.body` synchronously, every aborted attempt
 * would leak a pane into the DOM (each with its own RAF loop).
 *
 * This slot tracks the most recent pane that hasn't been "claimed" by a
 * committed `useEffect`. When `createPane` is called again, any still-
 * unclaimed pane is disposed first — cleaning up orphans from the previous
 * discarded render. Once `usePane`'s effect commits, it calls `claimPane`
 * to prevent the current pane from being disposed by future `createPane`
 * calls in unrelated components.
 */
let _unclaimedPane: PaneBundle | null = null

export function claimPane(bundle: PaneBundle): void {
  if (_unclaimedPane === bundle) _unclaimedPane = null
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
    scene,
    ...rest
  } = options

  // Dispose any orphaned pane from a previous (aborted) render attempt.
  if (_unclaimedPane) {
    _unclaimedPane.pane.dispose()
    _unclaimedPane = null
  }

  const pane = new Pane({ title, expanded, ...rest })

  // Ensure pane floats above canvas elements (R3F creates full-viewport divs)
  pane.element.style.zIndex = '1000'

  applyTheme(pane.element, FLATLAND_THEME)
  registerPlugins(pane)

  // Idle-dimming + pin toggle. The pane is translucent while the mouse
  // isn't over it, fully opaque on hover. Clicking the pin in the header
  // locks it to fully opaque regardless of hover. See theme.ts for the
  // CSS that backs the `tp-flatland-dimmable` / `tp-flatland-pinned`
  // classes and the `tp-flatland-pin` element.
  pane.element.classList.add('tp-flatland-dimmable')
  const header = pane.element.querySelector('.tp-rotv_b') as HTMLElement | null
  if (header) {
    const pin = document.createElement('span')
    pin.className = 'tp-flatland-pin'
    pin.setAttribute('role', 'button')
    pin.setAttribute('aria-label', 'Keep pane opaque')
    pin.setAttribute('aria-pressed', 'false')
    pin.tabIndex = 0
    pin.title = 'Keep pane opaque'
    pin.innerHTML = '<svg width="10" height="10" viewBox="0 0 14 14"><circle cx="7" cy="7" r="4"/></svg>'

    const togglePin = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      const pinned = pane.element.classList.toggle('tp-flatland-pinned')
      pin.setAttribute('aria-pressed', String(pinned))
    }
    pin.addEventListener('click', togglePin)
    // Stop mousedown so the header button doesn't flash its :active state
    // (and doesn't gain focus) when clicking the pin.
    pin.addEventListener('mousedown', (e) => {
      e.stopPropagation()
    })
    pin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') togglePin(e)
    })

    header.insertBefore(pin, header.firstChild)
  }

  let graph: StatsGraphHandle | null = null
  let statsRow: StatsRowHandle | null = null

  if (showStats) {
    // Cycling FPS/MS/GPU/MEM graph at the top of the pane.
    graph = addStatsGraph(pane)
    // Single-row readout for draws/tris/geoms/textures.
    statsRow = addStatsRow(pane)
  }

  const stats: StatsHandle = {
    begin() {
      graph?.begin()
    },
    end() {
      graph?.end()
    },
    update(info) {
      // Aggregate lines + points into `prims` — both are tracked in the
      // StatsUpdate contract but we render them as a single column.
      let prims: number | undefined
      if (info.lines !== undefined || info.points !== undefined) {
        prims = (info.lines ?? 0) + (info.points ?? 0)
      }
      statsRow?.update({
        draws: info.drawCalls,
        tris: info.triangles,
        prims,
        geoms: info.geometries,
        textures: info.textures,
      })
    },
  }

  // Auto-wire draw/triangle stats via scene.onAfterRender.
  // Fires synchronously inside renderer.render() — AFTER info is populated
  // and BEFORE three.js's Animation RAF can auto-reset it (R3F v10 doesn't
  // drive render via setAnimationLoop, so the reset is out-of-band with
  // R3F's phase graph and useFrame-based polling would read stale 0s).
  //
  // Also fires GPU timestamp resolution (when the renderer was constructed
  // with `{ trackTimestamp: true }` and the adapter supports it), feeding
  // `renderer.info.render.timestamp` (ms) into the graph's GPU mode. The
  // async readback has a 1–2 frame lag so values trail the current frame.
  let restoreSceneHook: (() => void) | null = null
  if (showStats && scene) {
    // three.js types `onAfterRender` with the Object3D per-object signature
    // (`renderer, scene, camera, geometry, material, group`), but at the
    // Scene level three.js calls it with a different shape
    // (`renderer, scene, camera, renderTarget` — see `Renderer.js:1683`).
    // We chain to the previous value using a permissive callable type.
    type AnyCallable = (this: unknown, ...args: unknown[]) => void
    const prev = scene.onAfterRender as unknown as AnyCallable
    let gpuDetected = false
    const hook: AnyCallable = function (this: unknown, ...args) {
      prev.call(this, ...args)
      const renderer = args[0] as StatsRenderer | undefined
      if (!renderer) return
      const render = renderer.info?.render
      const memory = renderer.info?.memory
      statsRow?.update({
        draws: render?.drawCalls,
        tris: render?.triangles,
        prims: (render?.lines ?? 0) + (render?.points ?? 0),
        geoms: memory?.geometries,
        textures: memory?.textures,
      })

      // GPU timing — lazy-detect capability on first fire, then each frame
      // trigger the async readback and push whatever's currently resolved.
      if (renderer.backend?.trackTimestamp === true) {
        if (!gpuDetected) {
          gpuDetected = true
          graph?.enableGpuMode()
        }
        renderer.resolveTimestampsAsync?.('render').catch(() => {
          /* ignore — transient readback failures are fine, we'll retry next frame */
        })
        const ts = render?.timestamp
        if (typeof ts === 'number') graph?.pushGpuTime(ts)
      }
    }
    ;(scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = hook
    restoreSceneHook = () => {
      if ((scene as unknown as { onAfterRender: AnyCallable }).onAfterRender === hook) {
        ;(scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = prev
      }
    }
  }

  // Clean up on dispose
  const originalDispose = pane.dispose.bind(pane)
  pane.dispose = () => {
    graph?.dispose()
    statsRow?.dispose()
    restoreSceneHook?.()
    originalDispose()
  }

  const bundle: PaneBundle = { pane, fpsGraph: null, stats }
  _unclaimedPane = bundle
  return bundle
}

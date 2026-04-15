import { Pane } from 'tweakpane'
import type { Scene } from 'three'
import { applyTheme, FLATLAND_THEME } from './theme.js'
import { registerPlugins } from './plugins.js'
import { addStatsGraph, type StatsGraphHandle } from './stats-graph.js'
import { addStatsRow, type StatsRowHandle } from './stats-row.js'
import { mountDevtoolsPanel, type DevtoolsPanelHandle } from './devtools-panel.js'

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
    /** Set to `true` when the backend was constructed with `{ trackTimestamp: true }`. On WebGPU this is auto-downgraded to `false` if the adapter lacks `GPUFeatureName.TimestampQuery`; on WebGL it stays `true` even without the `EXT_disjoint_timer_query_webgl2` extension, so we also have to inspect `backend.disjoint`. */
    trackTimestamp?: boolean
    /** WebGL-only: the `EXT_disjoint_timer_query_webgl2` extension object. `null` if unavailable → GPU timing can't work on this backend. */
    disjoint?: unknown
    constructor?: { name?: string }
  }
  /** Fire-and-forget — triggers async readback of the GPU timestamp query pool. */
  resolveTimestampsAsync?(type: 'render' | 'compute'): Promise<number | undefined>
}

/** True if this backend can actually populate `info.render.timestamp`. */
function canTrackGpuTimestamps(renderer: StatsRenderer): boolean {
  const backend = renderer.backend
  if (!backend || backend.trackTimestamp !== true) return false
  // WebGL fallback: the base `Backend` class doesn't downgrade
  // `trackTimestamp` based on the `EXT_disjoint_timer_query_webgl2`
  // extension — we have to check `backend.disjoint` ourselves, otherwise
  // we'd enable GPU mode with no data on WebGL2 machines that lack the
  // extension. WebGPU auto-downgrades `trackTimestamp` to `false` in
  // `WebGPUBackend.init()` so no extra check is needed there.
  const isWebGL = backend.constructor?.name === 'WebGLBackend'
  if (isWebGL && !backend.disjoint) return false
  return true
}

/**
 * Wire a Three.js `Scene` into a `StatsHandle` — hooks `scene.onAfterRender`
 * to capture `info.render` / `info.memory` on every render, and drains the
 * GPU timestamp query pool via a per-frame microtask when trackTimestamp is
 * available on the backend.
 *
 * Used by both `createPane({ scene })` (vanilla three.js path) and
 * `useStatsMonitor` (React path) — centralises the scene plumbing so the
 * pool-drain and GPU-mode detection behave identically regardless of which
 * entry point created the pane.
 *
 * Returns a cleanup function that restores the previous `onAfterRender`.
 */
export function wireSceneStats(
  scene: Scene,
  stats: StatsHandle,
  options: { debug?: boolean } = {},
): () => void {
  const { debug = false } = options

  // three.js types `onAfterRender` with the Object3D per-object signature
  // (`renderer, scene, camera, geometry, material, group`), but at the
  // Scene level three.js calls it with a different shape
  // (`renderer, scene, camera, renderTarget` — see `Renderer.js:1683`).
  // We chain to the previous value using a permissive callable type.
  //
  // We keep two references: `original` is the exact function reference so the
  // cleanup return path can restore identity (otherwise stacked wireSceneStats
  // calls or test assertions break), and `prev` is a `.bind(scene)` copy that
  // we call internally — binding here silences `@typescript-eslint/unbound-method`
  // when we invoke the previous hook from inside our wrapper.
  type AnyCallable = (this: unknown, ...args: unknown[]) => void
  // Cast to escape the typed method access — `scene.onAfterRender` would
  // otherwise trip `@typescript-eslint/unbound-method`. We need the raw
  // function reference (not bound) so the cleanup path below can restore
  // identity (`scene.onAfterRender = original`).
  const original = (scene as unknown as { onAfterRender: AnyCallable }).onAfterRender
  const prev = original.bind(scene)
  let gpuDetected = false
  let firstGpuLogged = false
  let debugLogged = false

  const hook: AnyCallable = function (this: unknown, ...args) {
    prev(...args)
    const renderer = args[0] as StatsRenderer | undefined
    if (!renderer) return

    const render = renderer.info?.render
    const memory = renderer.info?.memory
    stats.update({
      drawCalls: render?.drawCalls,
      triangles: render?.triangles,
      lines: render?.lines,
      points: render?.points,
      geometries: memory?.geometries,
      textures: memory?.textures,
    })

    const gpuCapable = canTrackGpuTimestamps(renderer)
    if (gpuCapable && !gpuDetected) {
      gpuDetected = true
      stats.enableGpu()
    }

    if (debug && !debugLogged) {
      debugLogged = true
      const backendName = renderer.backend?.constructor?.name ?? 'unknown'
      console.info('[flatland stats] diagnostics', {
        backend: backendName,
        'backend.trackTimestamp': renderer.backend?.trackTimestamp,
        'backend.disjoint (WebGL only)': renderer.backend?.disjoint ?? '(n/a)',
        gpuModeEnabled: gpuDetected,
        'info.render': render,
        'info.memory': memory,
      })
    }

    // Queue the GPU timestamp resolution as a MICROTASK so it runs AFTER
    // the current `renderer.render()` call has fully unwound. Calling
    // resolveTimestampsAsync synchronously from inside scene.onAfterRender
    // re-enters the renderer mid-render and corrupts the WebGPU timestamp
    // query pool. The pool dedupes concurrent calls internally via
    // `pendingResolve`, so firing one microtask per render frame is safe
    // even when post-processing fans out into multiple render passes.
    if (gpuCapable) {
      const fn = renderer.resolveTimestampsAsync?.bind(renderer)
      if (!fn) return
      void Promise.resolve().then(() => {
        return Promise.resolve(fn('render')).then(() => {
          const ts = renderer.info?.render?.timestamp
          if (typeof ts !== 'number') return
          stats.gpuTime(ts)
          if (debug && ts > 0 && !firstGpuLogged) {
            firstGpuLogged = true
            console.info(
              '[flatland stats] first GPU time sample:',
              ts.toFixed(3),
              'ms',
            )
          }
        })
      }).catch(() => {
        /* swallow — transient readback failures are fine */
      })
    }
  }
  ;(scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = hook

  return () => {
    if ((scene as unknown as { onAfterRender: AnyCallable }).onAfterRender === hook) {
      ;(scene as unknown as { onAfterRender: typeof original }).onAfterRender = original
    }
  }
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
  /**
   * Log one-time diagnostic info to the console on the first frame — backend
   * class, `trackTimestamp` state, first resolved GPU time. Two
   * `console.info` calls total per pane (zero per-frame cost). Defaults to
   * `true` because three-flatland is a dev-focused toolkit — pass
   * `debug: false` explicitly if you're embedding a pane in a
   * public-facing app and don't want the logs in visitors' consoles.
   */
  debug?: boolean
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
  /**
   * Enable the cycling graph's `gpu` mode. Called once when GPU timing is
   * detected on the backend. Safe to call multiple times.
   */
  enableGpu(): void
  /**
   * Push a GPU frame time (milliseconds) into the graph's `gpu` mode.
   * No-op if GPU mode isn't enabled yet.
   */
  gpuTime(ms: number): void
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
    debug = true,
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
  const header = pane.element.querySelector<HTMLElement>('.tp-rotv_b')
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
  let devtoolsPanel: DevtoolsPanelHandle | null = null

  if (showStats) {
    // Cycling FPS/MS/GPU/MEM graph at the top of the pane.
    graph = addStatsGraph(pane)
    // Single-row readout for draws/tris/geoms/textures.
    statsRow = addStatsRow(pane)
  }

  // Auto-mount the devtools bus panel when `debug: true` (default).
  // Consumer code gets the panel "for free" — no extra calls needed.
  // If no producer is broadcasting (prod build, or explicit opt-out),
  // the panel sits silent with `server: dead` and zeros.
  if (debug) {
    try {
      devtoolsPanel = mountDevtoolsPanel(pane)
    } catch {
      // Bus not available (e.g., test environment without BroadcastChannel)
      // — swallow; panel just doesn't appear.
    }
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
    enableGpu() {
      graph?.enableGpuMode()
    },
    gpuTime(ms) {
      graph?.pushGpuTime(ms)
    },
  }

  // Vanilla three.js path: wire the scene hook here if the caller passed
  // `scene`. React goes through `useStatsMonitor` instead, which calls the
  // same `wireSceneStats` helper from its `useEffect`.
  const restoreSceneHook: (() => void) | null =
    showStats && scene ? wireSceneStats(scene, stats, { debug }) : null

  // Clean up on dispose
  const originalDispose = pane.dispose.bind(pane)
  pane.dispose = () => {
    graph?.dispose()
    statsRow?.dispose()
    devtoolsPanel?.dispose()
    restoreSceneHook?.()
    originalDispose()
  }

  const bundle: PaneBundle = { pane, fpsGraph: null, stats }
  _unclaimedPane = bundle
  return bundle
}

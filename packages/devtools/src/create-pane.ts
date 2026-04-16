import { Pane } from 'tweakpane'
import { applyTheme, FLATLAND_THEME } from './theme.js'
import { registerPlugins } from './plugins.js'
import { addStatsGraph, type StatsGraphHandle } from './stats-graph.js'
import { addStatsRow, type StatsRowHandle } from './stats-row.js'
import { addProviderSwitcher, type ProviderSwitcherHandle } from './provider-switcher.js'
import { addRegistryView, type RegistryViewHandle } from './registry-view.js'
import { addBuffersView, type BuffersViewHandle } from './buffers-view.js'
import { createBuffersModal, type BuffersModalHandle } from './buffers-modal.js'
import { DevtoolsClient } from './devtools-client.js'

export interface CreatePaneOptions {
  /** Custom container element */
  container?: HTMLElement
  /** Pane title (default: 'Controls') */
  title?: string
  /** Default expansion state (default: true) */
  expanded?: boolean
  /**
   * Who drives the stats-graph render?
   *  - `'raf'` (default): the pane starts its own `requestAnimationFrame`
   *    loop. Zero setup; fine for simple apps.
   *  - `'manual'`: no internal rAF. Call `bundle.update()` from your own
   *    frame tick — `renderer.setAnimationLoop` callback, R3F `useFrame`,
   *    or any ticker you already own. Preferred when you have a render
   *    loop; avoids a second rAF (which Safari throttles).
   */
  driver?: 'raf' | 'manual'
}

export interface PaneBundle {
  pane: Pane
  /**
   * Render a stats-graph frame. Call from your existing animation loop
   * (R3F `useFrame`, `renderer.setAnimationLoop`, etc.) for shared-tick
   * visuals — avoids a second `requestAnimationFrame` callback, which
   * Safari penalises.
   *
   * If you never call `update()`, the graph falls back to its own rAF
   * so the pane works out-of-the-box in apps without a render loop.
   */
  update(): void
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
    driver = 'raf',
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

  // Always-on stats graph + row, bus-driven. A single `DevtoolsClient`
  // feeds both. If the bus isn't available in the environment (e.g., a
  // test runner without BroadcastChannel), the try/catch swallows it
  // and the pane still works for user controls — just no stats display.
  let client: DevtoolsClient | null = null
  let graph: StatsGraphHandle | null = null
  let statsRow: StatsRowHandle | null = null
  let providerSwitcher: ProviderSwitcherHandle | null = null
  let registryView: RegistryViewHandle | null = null
  let buffersView: BuffersViewHandle | null = null
  let buffersModal: BuffersModalHandle | null = null

  const ACTIVE_FEATURES: ('stats' | 'env' | 'registry' | 'buffers')[] = ['stats', 'env', 'registry', 'buffers']

  try {
    client = new DevtoolsClient({ features: ACTIVE_FEATURES })
    graph = addStatsGraph(pane, client, { driver })
    statsRow = addStatsRow(pane, client)
    // Hidden until two or more providers announce.
    providerSwitcher = addProviderSwitcher(pane, client)
    // Hidden until the provider publishes at least one entry via
    // `registerDebugArray`.
    registryView = addRegistryView(pane, client)
    // Modal is built lazily — `createBuffersModal` mounts the DOM
    // immediately (display:none) so the first expand is instant.
    buffersModal = createBuffersModal(client)
    // Hidden until the provider publishes at least one debug texture
    // via `registerDebugTexture`. ⤢ in-blade button calls into the
    // modal handle.
    buffersView = addBuffersView(pane, client, {
      onExpand: (name) => buffersModal?.open(name),
    })
    client.start()

    // Pane fold → mute the bus. When the outer header is collapsed the
    // user can't see any of the data anyway, so we drop every feature
    // and let the provider skip all flushes. Expanding restores.
    pane.on('fold', (ev) => {
      const c = client
      if (c === null) return
      if (ev.expanded) c.setFeatures(ACTIVE_FEATURES)
      else c.setFeatures([])
    })
  } catch {
    // Bus unavailable — skip the stats blades. Pane still usable.
  }

  // Clean up on dispose. Idempotent: calling `dispose()` twice (e.g.,
  // once by the user and once by a later `createPane` disposing the
  // unclaimed slot) no-ops the second time instead of throwing.
  let disposed = false
  const originalDispose = pane.dispose.bind(pane)
  pane.dispose = () => {
    if (disposed) return
    disposed = true
    graph?.dispose()
    statsRow?.dispose()
    providerSwitcher?.dispose()
    registryView?.dispose()
    buffersView?.dispose()
    buffersModal?.dispose()
    client?.dispose()
    // If the user disposed the pane directly without claiming, free
    // the slot so the next createPane doesn't try to dispose us again.
    if (_unclaimedPane === bundle) _unclaimedPane = null
    originalDispose()
  }

  const bundle: PaneBundle = {
    pane,
    update: () => graph?.update(),
  }
  _unclaimedPane = bundle
  return bundle
}

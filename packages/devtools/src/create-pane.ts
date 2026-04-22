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
  /**
   * `true` once `pane.dispose()` has been called. Lets React hooks
   * detect that a prior cleanup tore the bundle down and decide
   * whether to recreate (StrictMode mount→cleanup→mount).
   */
  readonly disposed: boolean
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

  // Three-mode cycle — full → minimal → collapsed → full. Replaces
  // Tweakpane's binary fold with something more useful: "minimal" keeps
  // only the stats graph + draws/tris row visible (no buffers, no
  // registry, no provider switcher, no user-added controls) so you can
  // watch perf numbers without a giant pane covering the viewport, AND
  // without paying the cost of buffer streaming.
  type Mode = 'full' | 'minimal' | 'collapsed'
  let mode: Mode = expanded ? 'full' : 'collapsed'

  const applyMode = (): void => {
    pane.element.classList.toggle('tp-flatland-minimal', mode === 'minimal')
    // 'full' and 'minimal' both have the pane expanded at the TP level;
    // 'collapsed' folds it.
    if (pane.expanded !== (mode !== 'collapsed')) {
      pane.expanded = mode !== 'collapsed'
    }
    // Our own caret icon reflects the cycle position.
    if (modeToggle !== null) {
      modeToggle.setAttribute('data-mode', mode)
      modeToggle.setAttribute(
        'aria-label',
        mode === 'full' ? 'Full pane (click for minimal)'
        : mode === 'minimal' ? 'Minimal pane (click to collapse)'
        : 'Collapsed (click to expand)',
      )
    }
    const c = client
    if (c !== null) {
      // Feature gating follows the mode:
      //   full     → everything
      //   minimal  → stats + env only; no registry, no buffers drain
      //   collapsed → nothing
      if (mode === 'full') c.setFeatures(ACTIVE_FEATURES)
      else if (mode === 'minimal') c.setFeatures(['stats', 'env'])
      else c.setFeatures([])
    }
    // Propagate into the buffers view so it knows to unsubscribe. Both
    // 'minimal' and 'collapsed' ask the view to treat itself as folded
    // (no thumbnail stream, no GPU readback on the provider).
    buffersView?.setPaneFolded(mode !== 'full')
  }

  const cycleMode = (): void => {
    mode = mode === 'full' ? 'minimal' : mode === 'minimal' ? 'collapsed' : 'full'
    applyMode()
  }

  // Replace Tweakpane's built-in fold caret with our own mode-cycle
  // button AND intercept clicks anywhere on the pane header so the
  // native binary-fold behavior doesn't skip 'minimal'. The native
  // caret is hidden via CSS (.tp-rotv_m display:none).
  let modeToggle: HTMLElement | null = null
  if (header) {
    modeToggle = document.createElement('span')
    modeToggle.className = 'tp-flatland-mode'
    modeToggle.setAttribute('role', 'button')
    modeToggle.setAttribute('tabindex', '0')
    modeToggle.title = 'Cycle pane mode: full → minimal → collapsed'
    // Single caret glyph — CSS rotates it based on data-mode so one
    // visual vocabulary handles all three states. Matches tweakpane's
    // native rotating-caret convention and gives a screw-head look at
    // 45° for minimal.
    modeToggle.innerHTML = '<span class="tp-flatland-mode-glyph"></span>'
    const go = (e: Event): void => {
      e.preventDefault()
      e.stopPropagation()
      cycleMode()
    }
    modeToggle.addEventListener('click', go)
    modeToggle.addEventListener('mousedown', (e) => e.stopPropagation())
    modeToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') go(e)
    })
    header.appendChild(modeToggle)

    // Capture-phase click on the header itself — Tweakpane's root
    // component wires a listener that toggles `expanded`, which would
    // skip our tri-state. Intercept before it fires, cycle our modes,
    // stop propagation so the default toggle never runs. Clicks on our
    // own overlay buttons (pin, mode toggle) already stop propagation
    // themselves, so they're unaffected.
    const onHeaderClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (target === null) return
      // Let clicks on our own interactive children through untouched.
      if (target.closest('.tp-flatland-pin, .tp-flatland-mode') !== null) return
      e.preventDefault()
      e.stopPropagation()
      cycleMode()
    }
    header.addEventListener('click', onHeaderClick, true)
  }

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
    buffersModal = createBuffersModal(client, {
      onActiveChange: (name) => buffersView?.setActiveFromModal(name),
      onOpen: () => buffersView?.setModalOpen(true),
      onClose: () => buffersView?.setModalOpen(false),
    })
    // Hidden until the provider publishes at least one debug texture
    // via `registerDebugTexture`. ⤢ in-blade button calls into the
    // modal handle.
    buffersView = addBuffersView(pane, client, {
      onExpand: (name) => buffersModal?.open(name),
    })
    client.start()

    // Mark the always-visible blades so CSS can keep them shown while
    // hiding everything else in 'minimal' mode.
    graph?.element.classList.add('tp-flatland-minimal-keep')
    statsRow?.element.classList.add('tp-flatland-minimal-keep')

    applyMode()

    // Tweakpane still tries to toggle expanded when the user clicks the
    // header — intercept and redirect through our cycle. The `fold`
    // event fires from keyboard ⇥-space or external sets; keep it as a
    // fallback that syncs our mode if something else flips expansion.
    pane.on('fold', (ev) => {
      const desired: Mode = ev.expanded
        ? (mode === 'collapsed' ? 'full' : mode)
        : 'collapsed'
      if (desired !== mode) {
        mode = desired
        applyMode()
      }
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
    get disposed() {
      return disposed
    },
  }
  _unclaimedPane = bundle
  return bundle
}

/**
 * Shared lazy-load + IntersectionObserver helper for docs visual components.
 *
 * Contract (see docs-audit/visual-devices.md → Performance Contract):
 *   - Static placeholder renders without any dynamic deps
 *   - IntersectionObserver mounts on viewport entry, disposes on exit
 *   - Mobile + prefers-reduced-motion → require explicit tap-to-activate
 *   - Idempotent across re-entry / re-mount
 *
 * Use this for ANY component that depends on three.js, three-flatland,
 * mermaid, skia, or any other heavy client lib. Do NOT statically import
 * those packages — feed them in via the `loader` callback so they're
 * dynamic-import()'d only when the user actually scrolls to the component.
 */

export interface LazyOnViewOptions<T> {
  /** Element to observe. The host element of your component. */
  target: HTMLElement
  /** Async loader — typically `() => import('heavy-pkg')`. Memoize across instances. */
  loader: () => Promise<T>
  /** Called once `loader` resolves AND target is in view. Return a dispose closure. */
  mount: (loaded: T, target: HTMLElement) => Promise<(() => void) | void> | (() => void) | void
  /** rootMargin for the observer. Default '200px' — start fetching just before visible. */
  rootMargin?: string
  /**
   * If true, never auto-mount (small-viewport / reduced-motion path). Caller is
   * responsible for triggering activation manually.
   */
  manual?: boolean
}

export interface LazyOnViewHandle {
  /** Imperatively activate (e.g. from a tap-to-activate button). */
  activate: () => void
  /** Imperatively deactivate. Calls the dispose closure returned by `mount`. */
  deactivate: () => void
  /** Tear down the observer + dispose any active mount. */
  destroy: () => void
}

/**
 * Mobile / reduced-data / reduced-motion gating heuristic.
 * Returns true when the demo should NOT auto-mount even when in view.
 */
export function shouldGateActivation(): boolean {
  if (typeof window === 'undefined') return true
  const narrow = window.matchMedia('(max-width: 767px)').matches
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Some browsers ship `prefers-reduced-data`; treat unknown as false.
  const reducedData =
    window.matchMedia('(prefers-reduced-data: reduce)').matches === true
  return narrow || reducedMotion || reducedData
}

/**
 * Wire up lazy load + viewport observer for a docs visual component.
 * Returns a handle for imperative control.
 */
export function lazyOnView<T>(opts: LazyOnViewOptions<T>): LazyOnViewHandle {
  const { target, loader, mount, rootMargin = '200px', manual = false } = opts
  let dispose: (() => void) | null = null
  let active = false
  let pending = false

  async function activate() {
    if (active || pending) return
    pending = true
    try {
      const loaded = await loader()
      // Re-check liveness — observer may have left the viewport mid-load.
      if (!observer || !target.isConnected) return
      const cleanup = await mount(loaded, target)
      if (typeof cleanup === 'function') dispose = cleanup
      active = true
    } finally {
      pending = false
    }
  }

  function deactivate() {
    if (!active) return
    try {
      dispose?.()
    } finally {
      dispose = null
      active = false
    }
  }

  let observer: IntersectionObserver | null = null
  if (!manual && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void activate()
          } else {
            deactivate()
          }
        }
      },
      { rootMargin },
    )
    observer.observe(target)
  }

  return {
    activate: () => void activate(),
    deactivate,
    destroy() {
      observer?.disconnect()
      observer = null
      deactivate()
    },
  }
}

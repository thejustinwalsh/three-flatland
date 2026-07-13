import type { Camera } from 'three'
import type { Component } from '../components/component.js'
import type { RootContext } from '../context.js'
import { a11yGlobal } from './global-state.js'
import type { A11yViewport } from './projection.js'

/**
 * The single per-root source of truth for how a11y perceivability is judged: the camera, the LIVE
 * viewport, the occlusion probe, and the minimum-perceivable-size threshold. The projection owns it
 * (it runs each frame and holds the live canvas rect) and publishes it here; the focus manager reads
 * it so both classify against identical inputs instead of drifting apart — a panel can't be
 * `aria-hidden` by projection yet navigable by the manager, or judged against two different size
 * thresholds / two different viewports (codex system #6).
 */
export interface A11yVisibilityView {
  camera: Camera
  /** Reassigned each frame by the projection to the current canvas rect — read on demand by the manager. */
  viewport: A11yViewport
  occlusionProbe?: (c: Component) => boolean
  minPerceivableSize?: number
}

/** Per-root registry, guarded on globalThis (a11yGlobal) so duplicate module copies share one map. */
const views = a11yGlobal('visibilityViews', () => new WeakMap<RootContext, A11yVisibilityView>())

/** Publish (or, with `undefined`, retract on projection dispose) the shared view for a root. */
export function setA11yVisibilityView(
  root: RootContext,
  view: A11yVisibilityView | undefined
): void {
  if (view == null) {
    views.delete(root)
  } else {
    views.set(root, view)
  }
}

/** The projection's shared view for a root, or undefined when no projection is active for it. */
export function getA11yVisibilityView(root: RootContext): A11yVisibilityView | undefined {
  return views.get(root)
}

/**
 * Per-root focus reconciler. The focus manager registers `() => this.reconcileFocus()`; the projection
 * calls it each frame so a focused panel that has become imperceivable (camera moved it off / behind /
 * too small) is released instead of stranding stale `focused` state + a stuck DOM `activeElement`
 * (codex system #7). Routed through this leaf module on purpose — a direct projection→focus-manager
 * import would close a projection→focus-manager→visibility→projection runtime cycle.
 */
const reconcilers = a11yGlobal('focusReconcilers', () => new WeakMap<RootContext, () => void>())

export function setA11yFocusReconciler(
  root: RootContext,
  reconcile: (() => void) | undefined
): void {
  if (reconcile == null) {
    reconcilers.delete(root)
  } else {
    reconcilers.set(root, reconcile)
  }
}

/** Run the registered focus reconciler for a root (no-op when no manager registered one). */
export function runA11yFocusReconcile(root: RootContext): void {
  reconcilers.get(root)?.()
}

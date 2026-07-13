import { Raycaster, Vector3 } from 'three'
import type { Camera, Object3D } from 'three'
import type { Component } from '../components/component.js'
import { computeA11yScreenRect } from './projection.js'
import type { A11yViewport } from './projection.js'

/**
 * Mode-3 perceivability class (spec §4.1) — what assistive tech can perceive, as opposed to what
 * the renderer draws. World-space panels can be render-visible yet imperceivable: outside the
 * frustum, behind the camera, covered by another mesh, or projecting to a sliver.
 */
export type A11yVisibility =
  | 'visible'
  | 'offscreen'
  | 'behind-camera'
  | 'occluded'
  | 'too-small'
  | 'hidden'

export interface A11yVisibilityOptions {
  /** App hook for occlusion — returns TRUE when the component is perceivable (unoccluded). */
  occlusionProbe?: (c: Component) => boolean
  /** Smallest projected extent (px) that still counts as perceivable. Default 8. */
  minPerceivableSize?: number
}

/**
 * Classifies a component's a11y perceivability for one camera/viewport. Precedence: overrides and
 * render visibility first, then geometry (behind → offscreen → too-small), then the occlusion
 * probe — so the probe (the expensive, opt-in part) is only consulted for panels that already pass
 * every cheap test. `a11yVisibilityOverride: 'visible'` force-includes (e.g. a critical alarm
 * panel), skipping the geometry tests entirely — but never resurrects a render-hidden panel.
 */
export function classifyA11yVisibility(
  component: Component,
  camera: Camera,
  viewport: A11yViewport,
  options?: A11yVisibilityOptions
): A11yVisibility {
  const override = component.properties.value.a11yVisibilityOverride
  if (override === 'hidden' || !component.isVisible.peek()) {
    return 'hidden'
  }
  component.updateWorldMatrix(true, false)
  const rect = computeA11yScreenRect(component.matrixWorld, camera, viewport)
  if (rect == null) {
    // No valid projection (behind the camera / straddling the near plane): there is no screen rect to
    // place the hidden element at, so it cannot hold DOM focus. This precedes the override:'visible'
    // check on purpose — the override force-includes past the SOFT perceivability tests, but a panel
    // that literally cannot be projected stays behind-camera even under it, keeping projection and the
    // focus manager in agreement (both aria-hide / refuse focus) rather than diverging (codex system #5).
    return 'behind-camera'
  }
  if (override === 'visible') {
    // Force-include past the soft tests (offscreen / too-small / occlusion) — e.g. a critical alarm
    // panel — now that a valid on-screen rect is confirmed above.
    return 'visible'
  }
  if (
    rect.x + rect.w < viewport.x ||
    rect.x > viewport.x + viewport.width ||
    rect.y + rect.h < viewport.y ||
    rect.y > viewport.y + viewport.height
  ) {
    return 'offscreen'
  }
  // Smallest projected extent — a 200x2px sliver is not a perceivable target (codex P3 #5).
  if (Math.min(rect.w, rect.h) < (options?.minPerceivableSize ?? 8)) {
    return 'too-small'
  }
  if (options?.occlusionProbe != null && options.occlusionProbe(component) === false) {
    return 'occluded'
  }
  return 'visible'
}

export interface RaycastOcclusionProbeOptions {
  /** How many components get a fresh raycast per onFrame(). Default 8. */
  budgetPerFrame?: number
  /**
   * Ray origin. Without a camera, onFrame is a no-op and every probe stays at the unoccluded
   * default — occlusion is opt-in and needs to know where the viewer is.
   */
  camera?: Camera
}

/** True when `object` is the component itself or sits anywhere inside its subtree. */
function belongsTo(object: Object3D, component: Component): boolean {
  let current: Object3D | null = object
  while (current != null) {
    if (current === component) {
      return true
    }
    current = current.parent
  }
  return false
}

const rayOrigin = new Vector3()
const rayTarget = new Vector3()
const rayDirection = new Vector3()

/**
 * Budgeted round-robin occlusion helper for `classifyA11yVisibility`. `probe(c)` registers the
 * component and returns its cached perceivability (true until first checked); each `onFrame()`
 * raycasts from the camera toward at most `budgetPerFrame` registered components' world centers,
 * advancing a cursor so every component gets re-checked over successive frames. A component counts
 * as occluded when the nearest hit in `scene` (excluding the component's own subtree) is closer
 * than the panel center.
 *
 * Limitation: this is a single center-point test against ALL raycastable meshes in `scene` — a
 * mesh partially covering the panel edge won't register, and a large transparent mesh will. Apps
 * needing finer judgement supply their own `occlusionProbe`.
 */
export function createRaycastOcclusionProbe(
  scene: Object3D,
  options?: RaycastOcclusionProbeOptions
): { probe: (c: Component) => boolean; onFrame: () => void; dispose: () => void } {
  const budget = options?.budgetPerFrame ?? 8
  const registered: Component[] = []
  const registeredSet = new Set<Component>()
  const lastResult = new WeakMap<Component, boolean>()
  const raycaster = new Raycaster()
  let cursor = 0

  const probe = (c: Component): boolean => {
    if (!registeredSet.has(c)) {
      registeredSet.add(c)
      registered.push(c)
    }
    return lastResult.get(c) ?? true
  }

  /** Drop components whose subtree was disposed — `registered`/`registeredSet` strongly retain them,
   *  so without this a long-lived scene accumulates dead entries forever and keeps raycasting them
   *  (codex system #10). Cheap guard first so the compaction only runs when something actually left. */
  const pruneAborted = (): void => {
    // Optional-chained: real Components always carry an abortSignal, but this scene-wide probe accepts
    // any Component-typed value, so tolerate one without it (never-aborted) rather than throw.
    if (!registered.some((c) => c.abortSignal?.aborted)) {
      return
    }
    for (let i = registered.length - 1; i >= 0; i--) {
      const component = registered[i]!
      if (component.abortSignal?.aborted) {
        registered.splice(i, 1)
        registeredSet.delete(component)
        lastResult.delete(component)
      }
    }
    if (cursor >= registered.length) {
      cursor = 0
    }
  }

  const onFrame = (): void => {
    pruneAborted()
    const camera = options?.camera
    if (camera == null || registered.length === 0) {
      return
    }
    camera.updateWorldMatrix(true, false)
    rayOrigin.setFromMatrixPosition(camera.matrixWorld)
    const checks = Math.min(budget, registered.length)
    for (let i = 0; i < checks; i++) {
      const component = registered[cursor % registered.length]!
      cursor = (cursor + 1) % registered.length
      component.getWorldPosition(rayTarget)
      const panelDistance = rayOrigin.distanceTo(rayTarget)
      if (panelDistance === 0) {
        // The camera sits ON the panel center — no ray to cast, call it perceivable.
        lastResult.set(component, true)
        continue
      }
      rayDirection.copy(rayTarget).sub(rayOrigin).normalize()
      raycaster.set(rayOrigin, rayDirection)
      raycaster.near = 0
      raycaster.far = panelDistance
      const hits = raycaster.intersectObject(scene, true)
      // Hits arrive sorted by distance; the first one outside the component's own subtree decides.
      const blocker = hits.find(
        (hit) => !belongsTo(hit.object, component) && hit.distance < panelDistance - 1e-6
      )
      lastResult.set(component, blocker == null)
    }
  }

  /** Release all registered components (the strong retainers) so a torn-down scene's probe frees them. */
  const dispose = (): void => {
    registered.length = 0
    registeredSet.clear()
    cursor = 0
  }

  return { probe, onFrame, dispose }
}

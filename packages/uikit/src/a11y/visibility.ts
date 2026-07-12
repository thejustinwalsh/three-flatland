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
  if (override === 'visible') {
    return 'visible'
  }
  component.updateWorldMatrix(true, false)
  const rect = computeA11yScreenRect(component.matrixWorld, camera, viewport)
  if (rect == null) {
    return 'behind-camera'
  }
  if (
    rect.x + rect.w < viewport.x ||
    rect.x > viewport.x + viewport.width ||
    rect.y + rect.h < viewport.y ||
    rect.y > viewport.y + viewport.height
  ) {
    return 'offscreen'
  }
  if (Math.max(rect.w, rect.h) < (options?.minPerceivableSize ?? 8)) {
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
): { probe: (c: Component) => boolean; onFrame: () => void } {
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

  const onFrame = (): void => {
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

  return { probe, onFrame }
}

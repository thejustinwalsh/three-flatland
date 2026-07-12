import { Vector3 } from 'three'
import type { Camera, Matrix4 } from 'three'
import type { Component } from '../components/component.js'
import { Fullscreen } from '../components/fullscreen.js'
import { applyA11yDebugStyle, getA11yDebug } from './debug.js'
import { a11yFocusSkipSignal, getRootA11yContainer, getRootA11yMembers } from './hidden-element.js'
import { classifyA11yVisibility, type A11yVisibility } from './visibility.js'

/** Axis-aligned bounding rect of a projected panel, in canvas-local CSS px. */
export interface A11yScreenRect {
  x: number
  y: number
  w: number
  h: number
}

/** Canvas rect in CSS px — x/y are the page offset of the canvas. */
export interface A11yViewport {
  x: number
  y: number
  width: number
  height: number
}

// Module-scoped scratch vectors — computeA11yScreenRect runs per panel per frame, so it must not
// allocate. c0..c3 hold the four unit-quad corners through world space and projection; viewHelper
// holds the camera-space position for the behind-camera guard.
const c0 = new Vector3()
const c1 = new Vector3()
const c2 = new Vector3()
const c3 = new Vector3()
const corners = [c0, c1, c2, c3] as const
const viewHelper = new Vector3()

/**
 * Projects a uikit panel's world matrix to its enclosing screen-space AABB in canvas-local px.
 *
 * The matrix already maps the UNIT quad (corners at ±0.5, z = 0) to world space — panel size and
 * pixelSize are baked in upstream (see panel/instance/matrix.ts), so the corners are used as-is.
 * Returns null when any corner sits at/behind the camera plane (the rect is unreliable when the
 * panel straddles the camera) or when projection yields a non-finite coordinate.
 */
export function computeA11yScreenRect(
  panelWorldMatrix: Matrix4,
  camera: Camera,
  viewport: A11yViewport
): A11yScreenRect | null {
  c0.set(-0.5, -0.5, 0)
  c1.set(0.5, -0.5, 0)
  c2.set(-0.5, 0.5, 0)
  c3.set(0.5, 0.5, 0)

  // Behind-camera guard for all corners BEFORE projecting — three cameras look down -Z, and
  // Vector3.project mutates the corner via the perspective divide.
  for (const corner of corners) {
    corner.applyMatrix4(panelWorldMatrix)
    viewHelper.copy(corner).applyMatrix4(camera.matrixWorldInverse)
    if (viewHelper.z > -1e-6) {
      return null
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const corner of corners) {
    corner.project(camera)
    const sx = viewport.x + ((corner.x + 1) / 2) * viewport.width
    // NDC y flips: +1 is the top of the screen.
    const sy = viewport.y + ((1 - corner.y) / 2) * viewport.height
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
      return null
    }
    if (sx < minX) minX = sx
    if (sx > maxX) maxX = sx
    if (sy < minY) minY = sy
    if (sy > maxY) maxY = sy
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Off-screen fallback (matches hidden-element.ts) restored when no projection is active. */
const CONTAINER_OFFSCREEN = 'position:absolute;top:0;left:-1000vw;'
/** Overlay the canvas: absolutely-positioned children then place from the viewport origin. */
const CONTAINER_OVERLAY = 'position:fixed;top:0;left:0;'
/** Skip a style write unless the rect moved at least this many px (avoids per-frame reflow churn). */
const RECT_EPSILON = 1

export interface A11yProjectionOptions {
  camera: Camera
  /** Only `domElement` is read (for its on-page rect) — accepts a full three renderer. */
  renderer: { domElement: HTMLElement }
  /**
   * Opt-in occlusion hook (Mode 3): return false when another mesh covers the panel, so it's
   * treated as not-perceivable. See `createRaycastOcclusionProbe`. Ignored for screen-space roots.
   */
  occlusionProbe?: (component: Component) => boolean
  /** Below this projected px size a panel is `too-small` (aria-hidden). Default 8. */
  minPerceivableSize?: number
}

/**
 * Mode 2 projection (spec §3): each frame, position every hidden a11y element under `rootComponent`
 * over its panel's on-screen rect, so assistive tech, tab focus, and switch access hit-test the real
 * panel location. Registers into the root's per-frame pump; returns a dispose that unregisters and
 * restores the off-screen container fallback. SSR/degenerate frames hide the element rather than
 * mis-place it.
 */
export function setupA11yProjection(
  rootComponent: Component,
  { camera, renderer, occlusionProbe, minPerceivableSize }: A11yProjectionOptions
): () => void {
  const root = rootComponent.root.peek()
  const lastRects = new WeakMap<HTMLElement, A11yScreenRect>()
  // Every component this projection has classified — its focus-skip is projection-OWNED, so ownership
  // outlives any single element incarnation. Reset on dispose even for components whose role was since
  // removed (no longer in the members map), and NOT on mere element teardown (which would briefly
  // un-skip a still-offscreen panel across a role remove+re-add) (codex P3-round3 #4).
  const touched = new Set<Component>()
  // Screen-space roots (Fullscreen) are always visible|hidden — skip the per-frame frustum/occlusion
  // classify entirely so the Mode 1/2 cost floor is unchanged; world-space roots run the full policy.
  // (cast through unknown: Fullscreen's private fields make the direct instanceof narrowing a TS2367.)
  const isScreenSpace = (rootComponent as unknown) instanceof Fullscreen
  const visibilityOptions = { occlusionProbe, minPerceivableSize }

  const onFrame = (): void => {
    const members = getRootA11yMembers(root)
    if (members == null || members.size === 0) {
      return
    }
    // Overlay the container here rather than once at setup: it may be (re)created only after the
    // first role/input mounts, so it can start in the off-screen fallback and must be flipped once
    // it exists (else every projected element sits inside a -1000vw parent).
    const container = getRootA11yContainer(root)
    if (container != null && container.style.position !== 'fixed') {
      container.style.cssText = CONTAINER_OVERLAY
    }
    // Update the camera's full world chain (it may sit under a moving rig) and the root once; each
    // member recomputes its own world matrix below.
    camera.updateWorldMatrix(true, false)
    rootComponent.updateWorldMatrix(true, false)
    const canvasRect = renderer.domElement.getBoundingClientRect()
    const viewport = {
      x: canvasRect.left,
      y: canvasRect.top,
      width: canvasRect.width,
      height: canvasRect.height,
    }
    const debugOn = getA11yDebug().peek()
    for (const [component, element] of members) {
      touched.add(component)
      // Debug overlay: reveal the projected element (outline + role/name) so the a11y tree is visible
      // over the panels. Independent of positioning below — visibility:hidden members stay hidden.
      applyA11yDebugStyle(element, component, debugOn)
      // Not laid out yet → hide; a null globalPanelMatrix would otherwise place it at the root origin.
      if (component.globalPanelMatrix.peek() == null) {
        resetA11yVisibilityState(component, element)
        applyRect(element, null, lastRects)
        continue
      }
      let visibility: A11yVisibility
      if (isScreenSpace) {
        if (component !== rootComponent) {
          component.updateWorldMatrix(false, false)
        }
        visibility = component.isVisible.peek() ? 'visible' : 'hidden'
      } else {
        // classifyA11yVisibility refreshes the component's world matrix internally.
        visibility = classifyA11yVisibility(component, camera, viewport, visibilityOptions)
      }
      applyVisibilityPolicy(component, element, visibility, camera, viewport, lastRects)
    }
  }

  // onFrameEndSet runs AFTER every onFrameSet handler (layout, scroll, component frames) in the same
  // update() pass, so projection reads matrices that have already settled this frame — no 1-frame lag.
  root.onFrameEndSet.add(onFrame)
  root.requestFrame?.()

  return () => {
    root.onFrameEndSet.delete(onFrame)
    // Reset focus-skip on EVERY component this projection ever classified — including ones whose role
    // was since removed and so are no longer members — so no stale tabIndex -1 outlives the projection
    // (codex P3 #3 / round3 #4). Projection ownership outlives individual element incarnations.
    for (const component of touched) {
      const focusSkip = a11yFocusSkipSignal(component)
      if (focusSkip.value) {
        focusSkip.value = false
      }
    }
    // Restore projection-owned aria + inline styles on the elements that still exist, so a Mode-1 DOM
    // fallback (no projection) is tabbable again and no stale aria-hidden / visibility:hidden survives.
    const members = getRootA11yMembers(root)
    if (members != null) {
      for (const [component, element] of members) {
        resetA11yVisibilityState(component, element)
        restoreA11yElementStyle(element)
      }
    }
    const c = getRootA11yContainer(root)
    if (c != null) {
      c.style.cssText = CONTAINER_OFFSCREEN
    }
  }
}

/** Clear the visibility-policy state (aria-hidden + focus-skip) an element may be carrying. */
function resetA11yVisibilityState(component: Component, element: HTMLElement): void {
  if (element.hasAttribute('aria-hidden')) {
    element.removeAttribute('aria-hidden')
  }
  const focusSkip = a11yFocusSkipSignal(component)
  if (focusSkip.value) {
    focusSkip.value = false
  }
}

/**
 * Strip the projection-owned inline styles (visibility / transform / size) on teardown so a Mode-1
 * fallback element returns to natural DOM flow inside the off-screen container. Critically, a member
 * left at `visibility:hidden` (behind-camera / too-small / not-laid-out at dispose) would stay OUT of
 * the accessibility tree — visibility:hidden prunes the a11y subtree — defeating the fallback
 * (codex P3-round2 #5). Only for teardown; the per-frame not-laid-out path intentionally hides.
 */
function restoreA11yElementStyle(element: HTMLElement): void {
  element.style.removeProperty('visibility')
  element.style.removeProperty('transform')
  element.style.removeProperty('width')
  element.style.removeProperty('height')
}

function applyRect(
  element: HTMLElement,
  rect: A11yScreenRect | null,
  lastRects: WeakMap<HTMLElement, A11yScreenRect>
): void {
  if (rect == null || rect.w <= 0 || rect.h <= 0) {
    if (element.style.visibility !== 'hidden') {
      element.style.visibility = 'hidden'
    }
    return
  }
  const last = lastRects.get(element)
  const moved =
    last == null ||
    Math.abs(last.x - rect.x) > RECT_EPSILON ||
    Math.abs(last.y - rect.y) > RECT_EPSILON ||
    Math.abs(last.w - rect.w) > RECT_EPSILON ||
    Math.abs(last.h - rect.h) > RECT_EPSILON
  if (element.style.visibility === 'hidden') {
    element.style.visibility = 'visible'
  }
  if (!moved) {
    return
  }
  lastRects.set(element, rect)
  // transform (not left/top) so positioning stays off the layout path; width/height size the target.
  element.style.transform = `translate(${rect.x}px, ${rect.y}px)`
  element.style.width = `${rect.w}px`
  element.style.height = `${rect.h}px`
}

/**
 * Apply the Mode-3 visibility policy (spec §4.1) to one element:
 * - `visible` → in the a11y tree, focusable, positioned over the panel.
 * - `offscreen` / `occluded` → still in the tree (exposed to AT) but SKIPPED by sequential focus
 *   (tabIndex -1 via the component's focus-skip signal); positioned at its off-screen/covered rect.
 * - `behind-camera` / `too-small` → `aria-hidden` and hidden (not perceivable).
 * - `hidden` → hidden, out of the tree (the Phase-0 off-frustum behaviour).
 */
function applyVisibilityPolicy(
  component: Component,
  element: HTMLElement,
  visibility: A11yVisibility,
  camera: Camera,
  viewport: A11yViewport,
  lastRects: WeakMap<HTMLElement, A11yScreenRect>
): void {
  const focusSkip = a11yFocusSkipSignal(component)
  if (visibility === 'hidden' || visibility === 'behind-camera' || visibility === 'too-small') {
    if (visibility === 'hidden') {
      element.removeAttribute('aria-hidden')
    } else if (element.getAttribute('aria-hidden') !== 'true') {
      element.setAttribute('aria-hidden', 'true')
    }
    if (focusSkip.value) {
      focusSkip.value = false
    }
    applyRect(element, null, lastRects)
    return
  }
  if (element.hasAttribute('aria-hidden')) {
    element.removeAttribute('aria-hidden')
  }
  const shouldSkip = visibility !== 'visible'
  if (focusSkip.value !== shouldSkip) {
    focusSkip.value = shouldSkip
  }
  applyRect(element, computeA11yScreenRect(component.matrixWorld, camera, viewport), lastRects)
}

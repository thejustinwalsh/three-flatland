import { Vector3 } from 'three'
import type { Camera, Matrix4 } from 'three'
import type { Component } from '../components/component.js'
import { getRootA11yContainer, getRootA11yMembers } from './hidden-element.js'

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
  { camera, renderer }: A11yProjectionOptions
): () => void {
  const root = rootComponent.root.peek()
  const container = getRootA11yContainer(root)
  if (container != null) {
    container.style.cssText = CONTAINER_OVERLAY
  }
  const lastRects = new WeakMap<HTMLElement, A11yScreenRect>()

  const onFrame = (): void => {
    const members = getRootA11yMembers(root)
    if (members == null || members.size === 0) {
      return
    }
    camera.updateMatrixWorld()
    // Refresh the root's world matrix once; each member recomputes its own below.
    rootComponent.updateWorldMatrix(true, false)
    const canvasRect = renderer.domElement.getBoundingClientRect()
    const viewport = {
      x: canvasRect.left,
      y: canvasRect.top,
      width: canvasRect.width,
      height: canvasRect.height,
    }
    for (const [component, element] of members) {
      if (component !== rootComponent) {
        component.updateWorldMatrix(false, false)
      }
      applyRect(element, computeA11yScreenRect(component.matrixWorld, camera, viewport), lastRects)
    }
  }

  root.onFrameSet.add(onFrame)
  root.requestFrame?.()

  return () => {
    root.onFrameSet.delete(onFrame)
    const c = getRootA11yContainer(root)
    if (c != null) {
      c.style.cssText = CONTAINER_OFFSCREEN
    }
  }
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

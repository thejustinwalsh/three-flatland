import { Vector3 } from 'three'
import type { Camera, Matrix4 } from 'three'

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

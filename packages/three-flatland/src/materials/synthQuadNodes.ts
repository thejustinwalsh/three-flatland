import { float, varying, vec2, vec3, vertexIndex } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Synthesize the unit-quad corner position and UV from `vertexIndex`.
 *
 *   u = vertexIndex % 2   → 0,1,0,1
 *   v = vertexIndex / 2   → 0,0,1,1
 *
 * position = (u - 0.5, v - 0.5, 0), cornerUV = (u, v) — the same
 * corner/UV mapping PlaneGeometry(1, 1) shipped (uv.y = 1 at +y), so
 * atlas remaps and flips behave identically.
 *
 * Pair with `createSynthQuadGeometry()` (index `[0,1,2, 2,1,3]`, CCW).
 * Set `material.positionNode = position` and read `cornerUV` wherever
 * the shader previously read `uv()`.
 */
export function synthQuadNodes(): { position: Node<'vec3'>; cornerUV: Node<'vec2'> } {
  const vid = float(vertexIndex)
  const u = vid.mod(2)
  const v = vid.div(2).floor()
  return {
    position: vec3(u.sub(0.5), v.sub(0.5), 0),
    cornerUV: varying(vec2(u, v)) as unknown as Node<'vec2'>,
  }
}

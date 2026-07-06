import { BufferGeometry, Sphere, Vector3 } from 'three'

/**
 * Index order for the synthesized unit quad. CCW (front-facing under
 * three's default FrontSide) for the corner layout derived from
 * `vertexIndex`: v0=(-.5,-.5), v1=(.5,-.5), v2=(-.5,.5), v3=(.5,.5).
 */
export const SYNTH_QUAD_INDEX: readonly number[] = [0, 1, 2, 2, 1, 3]

/**
 * Index-only unit-quad geometry — no position/normal/uv vertex
 * attributes. The vertex shader synthesizes the corner position and UV
 * from `vertexIndex` (see `synthQuadNodes`), reclaiming the 3 vertex-
 * buffer bindings PlaneGeometry used to cost under WebGPU's
 * `maxVertexBuffers = 8` cap.
 *
 * `boundingSphere` is pre-set to the unit quad's circumsphere so
 * consumers that frustum-cull (standalone Sprite2D, TileLayer chunks)
 * never trigger `computeBoundingSphere()` on position-less geometry.
 */
export function createSynthQuadGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setIndex(SYNTH_QUAD_INDEX as number[])
  geometry.boundingSphere = new Sphere(new Vector3(), Math.SQRT1_2)
  return geometry
}

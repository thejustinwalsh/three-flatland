import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three'

/**
 * Index order for the synthesized unit quad. CCW (front-facing under
 * three's default FrontSide) for the corner layout derived from
 * `vertexIndex`: v0=(-.5,-.5), v1=(.5,-.5), v2=(-.5,.5), v3=(.5,.5).
 */
export const SYNTH_QUAD_INDEX: readonly number[] = [0, 1, 2, 2, 1, 3]

// Corner values for vertexIndex i in 0..3: u = i % 2, v = floor(i / 2),
// position = (u - 0.5, v - 0.5, 0), uv = (u, v). MUST match
// `synthQuadNodes()`'s synthesized values exactly — the built-in shader
// keeps reading vertexIndex, but these real attributes are what three's
// `uv()`/`positionGeometry()` resolve to for user TSL code.
const SYNTH_QUAD_POSITIONS = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0])
const SYNTH_QUAD_UVS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])

/**
 * Unit-quad geometry for the sprite/tile pipeline. The vertex shader
 * synthesizes corner position and UV from `vertexIndex` (see
 * `synthQuadNodes`) rather than reading these attributes — that keeps
 * the standard sprite path's vertex-buffer binding count at the
 * documented 2 (see `EffectMaterial.MAX_EFFECT_FLOATS`). The `position`
 * and `uv` attributes exist so three's `AttributeNode` (backing the
 * `uv()`/`positionGeometry()` TSL helpers) resolves real corner data for
 * user-authored effect nodes, instead of falling back to a constant
 * zero — WebGPU only binds a vertex buffer for attributes the compiled
 * shader actually consumes, so a material that never reads `uv()` still
 * spends no binding on it.
 *
 * The backing `Float32Array`s are module-level singletons shared by
 * every synth-quad geometry (the corner data is identical everywhere).
 * Each geometry still gets its own `BufferAttribute` object wrapping
 * that shared array — three's WebGPU backend destroys an attribute's
 * GPU buffer when ANY geometry referencing that exact attribute object
 * disposes, so sharing the `BufferAttribute` itself (not just the
 * array) would make disposing one sprite/chunk/batch silently evict the
 * shared quad's GPU buffer for every other live geometry.
 *
 * `boundingSphere` is pre-set to the unit quad's circumsphere so
 * consumers that frustum-cull (standalone Sprite2D, TileLayer chunks)
 * skip `computeBoundingSphere()`.
 */
export function createSynthQuadGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setIndex(SYNTH_QUAD_INDEX as number[])
  geometry.setAttribute('position', new BufferAttribute(SYNTH_QUAD_POSITIONS, 3))
  geometry.setAttribute('uv', new BufferAttribute(SYNTH_QUAD_UVS, 2))
  geometry.boundingSphere = new Sphere(new Vector3(), Math.SQRT1_2)
  return geometry
}

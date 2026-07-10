import { attribute, dot, fwidth, mat4, max, saturate, vec4 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * TSL helpers for SlugBatch's opt-in per-instance attribute groups:
 * a per-instance transform (`glyphMtx0..3`) and a per-instance 4-plane
 * clip (`glyphClip0..3`). Both ride vec4 lanes recomposed in the node
 * graph — WGSL has no mat4 vertex attributes, and the vec4-lane layout
 * is proven on both backends (E1).
 */

/** Per-instance transform lanes — the four COLUMNS of the instance matrix. */
export interface InstanceMatrixLanes {
  m0: Node<'vec4'>
  m1: Node<'vec4'>
  m2: Node<'vec4'>
  m3: Node<'vec4'>
}

/** Read the per-instance transform columns from `glyphMtx0..3`. */
export function instanceMatrixLanes(): InstanceMatrixLanes {
  return {
    m0: attribute<'vec4'>('glyphMtx0', 'vec4'),
    m1: attribute<'vec4'>('glyphMtx1', 'vec4'),
    m2: attribute<'vec4'>('glyphMtx2', 'vec4'),
    m3: attribute<'vec4'>('glyphMtx3', 'vec4'),
  }
}

/** Recompose the instance matrix from its column lanes (Q1). */
export function composeInstanceMatrix(lanes: InstanceMatrixLanes) {
  return mat4(lanes.m0, lanes.m1, lanes.m2, lanes.m3)
}

/**
 * Fold the instance matrix into one row of the mesh-level MVP.
 *
 * `row_r(MVP · M) = (row_r · col_0(M), row_r · col_1(M), …)` — this is the
 * per-instance Jacobian derivation: the dilation math consumes MVP rows,
 * so composing `MVP · M` per instance gives `slugDilate` the exact
 * screen-space footprint of THAT instance's transform (rotation,
 * non-uniform scale, perspective) instead of the shared mesh transform.
 */
export function foldInstanceRow(row: Node<'vec4'>, lanes: InstanceMatrixLanes) {
  return vec4(dot(row, lanes.m0), dot(row, lanes.m1), dot(row, lanes.m2), dot(row, lanes.m3))
}

/** Per-instance clip planes — lane `i` is plane `i` as `(nx, ny, nz, d)`. */
export interface ClipPlaneLanes {
  p0: Node<'vec4'>
  p1: Node<'vec4'>
  p2: Node<'vec4'>
  p3: Node<'vec4'>
}

/** Read the per-instance clip planes from `glyphClip0..3`. */
export function clipPlaneLanes(): ClipPlaneLanes {
  return {
    p0: attribute<'vec4'>('glyphClip0', 'vec4'),
    p1: attribute<'vec4'>('glyphClip1', 'vec4'),
    p2: attribute<'vec4'>('glyphClip2', 'vec4'),
    p3: attribute<'vec4'>('glyphClip3', 'vec4'),
  }
}

/**
 * Signed distances from a batch-local position to the 4 clip planes,
 * packed as a vec4. Computed in the VERTEX stage: each distance is
 * affine in position, so perspective-correct varying interpolation
 * reproduces it exactly at every fragment — one vec4 varying instead
 * of four plane varyings plus a position varying.
 */
export function clipDistances(position: Node<'vec3'>, lanes: ClipPlaneLanes) {
  const pos4 = vec4(position, 1.0)
  return vec4(dot(lanes.p0, pos4), dot(lanes.p1, pos4), dot(lanes.p2, pos4), dot(lanes.p3, pos4))
}

/**
 * Antialiased coverage of the 4-plane clip, as a multiply term in [0, 1].
 *
 * `fwidth` runs UNCONDITIONALLY (Q2) — clipping folds into the coverage
 * product, never a discard. The disabled sentinel `(0, 0, 0, 1)` yields
 * a constant distance of 1 with zero derivative, so each factor
 * saturates to exactly 1.0 and the multiply is an IEEE no-op — the
 * unclipped output is bit-identical to a clip-free material.
 */
export function clipCoverage(distances: Node<'vec4'>) {
  const w = max(fwidth(distances), vec4(1e-6))
  const c = saturate(distances.div(w).add(0.5))
  return c.x.mul(c.y).mul(c.z).mul(c.w)
}

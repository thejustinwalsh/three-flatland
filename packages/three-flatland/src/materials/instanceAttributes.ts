import { int, attribute, vec2 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import {
  LIT_FLAG_MASK,
  RECEIVE_SHADOWS_MASK,
  CAST_SHADOW_MASK,
} from './effectFlagBits'

/**
 * TSL accessors for the per-instance data packed into `SpriteBatch`'s
 * interleaved core buffer. Keep every named field readable through a
 * helper so shader code doesn't repeat the underlying attribute name
 * + component index, and the packed layout stays refactorable in one
 * place.
 *
 * Layout (see `packages/three-flatland/src/pipeline/SpriteBatch.ts`):
 *
 *   instanceSystem  (vec4, interleaved offset 8..11)
 *     .x = flipX                 — readFlip().x
 *     .y = flipY                 — readFlip().y
 *     .z = system flags bitfield — readSystemFlags() + typed bit readers
 *     .w = MaterialEffect enable — readEnableBits()
 *
 *   instanceExtras  (vec4, interleaved offset 12..15)
 *     .x = per-instance shadow radius — readShadowRadius()
 *     .y/.z/.w reserved for future per-instance shadow / system data
 *
 * `instanceUV` and `instanceColor` stay raw — materials read them
 * directly via the usual `attribute(...)` calls since they're simple
 * passthroughs with no bit math or reinterpretation.
 */

// ─── Raw named reads ──────────────────────────────────────────────

/**
 * Read the per-instance flip vector from `instanceSystem.xy`. Each
 * component is +1 for unflipped, -1 for flipped. Consumers typically
 * destructure into `.x` and `.y` to drive axis-specific flip math.
 */
export function readFlip(): Node<'vec2'> {
  const sys = attribute<'vec4'>('instanceSystem', 'vec4')
  return vec2(sys.x, sys.y)
}

/**
 * Read the raw system-flags bitfield from `instanceSystem.z`. Bit 0 =
 * lit, bit 1 = receiveShadows, bit 2 = castsShadow, bits 3..23 reserved.
 * Prefer the typed helpers ({@link readLitFlag}, etc.) for individual
 * bits — this is the lower-level access used when you need to mask or
 * compare against multiple bits at once.
 */
export function readSystemFlags(): Node<'int'> {
  return int(attribute<'vec4'>('instanceSystem', 'vec4').z)
}

/**
 * Read the MaterialEffect enable-bits bitmask from `instanceSystem.w`.
 * Bit N is set while the Nth registered effect is active on this
 * instance. 24 slots (bits 0..23) — matches `EFFECT_BIT_OFFSET`.
 */
export function readEnableBits(): Node<'int'> {
  return int(attribute<'vec4'>('instanceSystem', 'vec4').w)
}

/**
 * Read the per-instance shadow-occluder radius from `instanceExtras.x`.
 * World units. Auto-resolved each frame to `max(|scale.x|, |scale.y|)`
 * by `transformSyncSystem`, overridable via `Sprite2D.shadowRadius`.
 *
 * Shadow-casting LightEffects consume this value for algorithm-
 * specific purposes — SDF sphere-tracers use it as the self-silhouette
 * escape distance; future shadow maps would use it for depth bias;
 * AO passes could use it for sample radius.
 */
export function readShadowRadius(): Node<'float'> {
  return attribute<'vec4'>('instanceExtras', 'vec4').x
}

// ─── Typed bit readers ────────────────────────────────────────────

/**
 * Read the per-instance lit flag (bit 0 of `instanceSystem.z`).
 * Used by `wrapWithLightFlags` to gate the light pipeline; custom
 * ColorTransforms can also call this directly.
 */
export function readLitFlag(): Node<'bool'> {
  return readSystemFlags().bitAnd(int(LIT_FLAG_MASK)).greaterThan(int(0))
}

/**
 * Read the per-instance receiveShadows flag (bit 1 of
 * `instanceSystem.z`). Preset LightEffects call this in their shadow
 * calculation to skip shadow for sprites that have opted out.
 */
export function readReceiveShadowsFlag(): Node<'bool'> {
  return readSystemFlags().bitAnd(int(RECEIVE_SHADOWS_MASK)).greaterThan(int(0))
}

/**
 * Read the per-instance castsShadow flag (bit 2 of `instanceSystem.z`).
 * Consumed by the occlusion-pass fragment shader to mask a sprite's
 * alpha contribution to the SDF seed — casters emit their silhouette,
 * non-casters emit alpha = 0.
 */
export function readCastShadowFlag(): Node<'bool'> {
  return readSystemFlags().bitAnd(int(CAST_SHADOW_MASK)).greaterThan(int(0))
}

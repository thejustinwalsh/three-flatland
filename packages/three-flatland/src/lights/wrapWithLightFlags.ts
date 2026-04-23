import { int, attribute, select } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import {
  LIT_FLAG_MASK,
  RECEIVE_SHADOWS_MASK,
  CAST_SHADOW_MASK,
} from '../sprites/Sprite2D'
import type { ColorTransformFn } from '../materials/Sprite2DMaterial'

/**
 * Wrap a light ColorTransformFn with a per-instance lit-bit check.
 *
 * Reads bit 0 of `effectBuf0.x` and uses `select()` to bypass lighting
 * for sprites whose lit flag is not set. Only needed for batched sprites —
 * standalone usage can assign the raw `lightFn` directly.
 *
 * @param lightFn - The lighting ColorTransformFn to wrap
 * @returns A new ColorTransformFn that gates lighting per instance
 */
export function wrapWithLightFlags(lightFn: ColorTransformFn): ColorTransformFn {
  return (ctx) => {
    const flags = int(attribute<'vec4'>('effectBuf0', 'vec4').x)
    const isLit = flags.bitAnd(int(LIT_FLAG_MASK)).greaterThan(int(0))
    const litColor = lightFn(ctx)
    return select(isLit, litColor, ctx.color)
  }
}

/**
 * Read the per-instance receiveShadows flag (bit 1 of `effectBuf0.x`).
 *
 * Preset LightEffects call this in their shadow calculation to skip
 * shadow for sprites that have opted out.
 *
 * @returns A TSL boolean node — `true` when the sprite receives shadows
 */
export function readReceiveShadowsFlag(): Node<'bool'> {
  const flags = int(attribute<'vec4'>('effectBuf0', 'vec4').x)
  return flags.bitAnd(int(RECEIVE_SHADOWS_MASK)).greaterThan(int(0))
}

/**
 * Read the per-instance castsShadow flag (bit 2 of `effectBuf0.x`).
 *
 * Consumed by the occlusion-pass fragment shader to mask a sprite's
 * alpha contribution to the SDF seed — casters emit their silhouette,
 * non-casters emit alpha = 0.
 *
 * @returns A TSL boolean node — `true` when the sprite casts shadow.
 */
export function readCastShadowFlag(): Node<'bool'> {
  const flags = int(attribute<'vec4'>('effectBuf0', 'vec4').x)
  return flags.bitAnd(int(CAST_SHADOW_MASK)).greaterThan(int(0))
}

/**
 * Read the per-instance shadow-occluder radius from the
 * `instanceShadowRadius` attribute. This is the sprite's size as an
 * occluder in world units — auto-resolved to `max(|scale.x|, |scale.y|)`
 * each frame by `transformSyncSystem`, overridable via the
 * `shadowRadius` field on Sprite2D.
 *
 * Shadow-casting LightEffects consume this per-instance value rather
 * than a scene-wide uniform so scenes with mixed-size casters don't
 * have to calibrate a single value that works for everybody. The SDF
 * sphere-tracer uses it as the self-silhouette escape distance; other
 * shadow systems (future shadow maps, AO) would use it for depth bias
 * or sample radius.
 *
 * @returns A TSL float node — the sprite's occluder radius in world units.
 */
export function readShadowRadius(): Node<'float'> {
  return attribute<'float'>('instanceShadowRadius', 'float')
}

import { int, attribute, select } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { LIT_FLAG_MASK, RECEIVE_SHADOWS_MASK } from '../sprites/Sprite2D'
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

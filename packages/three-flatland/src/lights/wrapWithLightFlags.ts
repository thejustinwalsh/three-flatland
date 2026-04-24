import { select } from 'three/tsl'
import { readLitFlag } from '../materials/instanceAttributes'
import type { ColorTransformFn } from '../materials/Sprite2DMaterial'

/**
 * Wrap a light `ColorTransformFn` with a per-instance lit-bit gate.
 *
 * Uses {@link readLitFlag} + `select()` to bypass lighting for sprites
 * whose `lit` flag is not set. Only needed for batched sprites —
 * standalone usage can assign the raw `lightFn` directly.
 *
 * This is the only light-specific helper in the per-instance-accessor
 * family; the raw accessors ({@link readFlip}, {@link readShadowRadius},
 * etc.) live in `materials/instanceAttributes.ts` alongside the
 * flag-mask constants that define the bit layout. They're re-exported
 * from this module's barrel for convenience and backward compatibility.
 *
 * @param lightFn - The lighting ColorTransformFn to wrap
 * @returns A new ColorTransformFn that gates lighting per instance
 */
export function wrapWithLightFlags(lightFn: ColorTransformFn): ColorTransformFn {
  return (ctx) => {
    const isLit = readLitFlag()
    const litColor = lightFn(ctx)
    return select(isLit, litColor, ctx.color)
  }
}

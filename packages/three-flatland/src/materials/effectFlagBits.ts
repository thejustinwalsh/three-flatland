/**
 * Bit layout for the per-instance `effectBuf0.x` flag word.
 *
 * Values are packed into a Float32 attribute and must stay within the
 * 24-bit mantissa range so bitwise arithmetic in TSL reproduces the CPU
 * value exactly. With {@link EFFECT_BIT_OFFSET} = 3 the top usable bit is
 * 23, leaving 21 MaterialEffect enable slots before we need to spill into
 * `effectBuf0.y` (another 24 bits) or add a new vec4 attribute.
 *
 * All bit constants live here (not in `Sprite2D.ts`) so `EffectMaterial`
 * can consume them without importing from `sprites/` — preventing a
 * Sprite2D → Sprite2DMaterial → EffectMaterial → Sprite2D cycle.
 */

/** Bit 0: sprite receives lighting from Flatland's LightEffect. */
export const LIT_FLAG_BIT = 0
export const LIT_FLAG_MASK = 1 << LIT_FLAG_BIT

/** Bit 1: sprite receives shadows from the SDF shadow pipeline. */
export const RECEIVE_SHADOWS_BIT = 1
export const RECEIVE_SHADOWS_MASK = 1 << RECEIVE_SHADOWS_BIT

/** Bit 2: sprite casts shadow — contributes to the occlusion pre-pass. */
export const CAST_SHADOW_BIT = 2
export const CAST_SHADOW_MASK = 1 << CAST_SHADOW_BIT

/**
 * MaterialEffect enable bits start here. Bits 0..(EFFECT_BIT_OFFSET-1)
 * are reserved system flags. See {@link EffectMaterial.registerEffect}
 * for how per-effect bit indices are allocated.
 */
export const EFFECT_BIT_OFFSET = 3

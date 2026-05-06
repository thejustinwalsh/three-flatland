/**
 * Bit layout for the per-instance system-flags word.
 *
 * The word lives in the interleaved core buffer at `instanceSystem.z`
 * (offset 10 within the stride-16 layout — see
 * `pipeline/SpriteBatch.ts` and `materials/instanceAttributes.ts`).
 * Effect-specific data (`effectBuf0`, `effectBuf1`, …) is allocated
 * separately based on each material's effect schema; system flags
 * predate any effect and live on the core buffer so every
 * Sprite2DMaterial-backed mesh carries them.
 *
 * MaterialEffect enable bits live in the adjacent slot
 * `instanceSystem.w`. Each registered effect occupies one bit
 * (effect 0 → bit 0, etc.) up to 24 slots.
 *
 * Values stay within Float32's 24-bit mantissa so bitwise arithmetic
 * in TSL reproduces the CPU value exactly.
 *
 * All bit constants live here so `EffectMaterial` can consume them
 * without importing from `sprites/` — preventing a
 * Sprite2D → Sprite2DMaterial → EffectMaterial → Sprite2D cycle.
 */

// ─── System flags — live in instanceSystem.z ─────────────────────────

/** Bit 0: sprite receives lighting from Flatland's LightEffect. */
export const LIT_FLAG_BIT = 0
export const LIT_FLAG_MASK = 1 << LIT_FLAG_BIT

/** Bit 1: sprite receives shadows from the SDF shadow pipeline. */
export const RECEIVE_SHADOWS_BIT = 1
export const RECEIVE_SHADOWS_MASK = 1 << RECEIVE_SHADOWS_BIT

/** Bit 2: sprite casts shadow — contributes to the occlusion pre-pass. */
export const CAST_SHADOW_BIT = 2
export const CAST_SHADOW_MASK = 1 << CAST_SHADOW_BIT

// ─── MaterialEffect enable bits — live in instanceSystem.w ───────────

/**
 * Bit index at which the first registered MaterialEffect enable bit
 * sits within `instanceSystem.w`. The first effect occupies bit 0,
 * the second bit 1, and so on up to 24 slots.
 *
 * Kept as an exported constant — and at zero — so callers can compute
 * per-effect masks as `1 << (EFFECT_BIT_OFFSET + i)` and stay robust
 * to a future change (e.g., reserving low enable bits for framework
 * use).
 */
export const EFFECT_BIT_OFFSET = 0

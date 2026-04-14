/**
 * Bit + component layout for the per-instance `effectBuf0` vec4 attribute.
 *
 * The attribute is already allocated and uploaded per instance every
 * frame — dedicating each vec4 component to a specific role costs no
 * extra bandwidth over packing everything into `.x`.
 *
 * Layout:
 *
 * | Component | Role | Capacity |
 * |---|---|---|
 * | `.x` | System flags (lit, receiveShadows, castsShadow, …) | 24 bits |
 * | `.y` | MaterialEffect enable bits (one bit per registered effect) | 24 slots |
 * | `.z` | Reserved — next overflow target | — |
 * | `.w` | Reserved — next overflow target | — |
 *
 * Values stay within Float32's 24-bit mantissa so bitwise arithmetic in
 * TSL reproduces the CPU value exactly in each component.
 *
 * All bit constants live here so `EffectMaterial` can consume them
 * without importing from `sprites/` — preventing a
 * Sprite2D → Sprite2DMaterial → EffectMaterial → Sprite2D cycle.
 */

// ─── System flags — live in effectBuf0.x ─────────────────────────────

/** Bit 0: sprite receives lighting from Flatland's LightEffect. */
export const LIT_FLAG_BIT = 0
export const LIT_FLAG_MASK = 1 << LIT_FLAG_BIT

/** Bit 1: sprite receives shadows from the SDF shadow pipeline. */
export const RECEIVE_SHADOWS_BIT = 1
export const RECEIVE_SHADOWS_MASK = 1 << RECEIVE_SHADOWS_BIT

/** Bit 2: sprite casts shadow — contributes to the occlusion pre-pass. */
export const CAST_SHADOW_BIT = 2
export const CAST_SHADOW_MASK = 1 << CAST_SHADOW_BIT

// ─── effectBuf0 component routing ────────────────────────────────────

/** Component index of the system-flag word in `effectBuf0`. */
export const SYSTEM_FLAGS_COMPONENT = 0

/** Component index of the MaterialEffect enable-bit word in `effectBuf0`. */
export const EFFECT_ENABLE_COMPONENT = 1

// ─── MaterialEffect enable-bit layout — lives in effectBuf0.y ────────

/**
 * Bit index at which the first registered MaterialEffect enable bit sits
 * within its dedicated component (`effectBuf0.y`). The first effect
 * occupies bit 0, the second bit 1, and so on up to 24 slots.
 *
 * Kept as an exported constant — and at zero — so callers can compute
 * per-effect masks as `1 << (EFFECT_BIT_OFFSET + i)` and stay robust to
 * a future change (e.g., reserving low enable bits for framework use).
 */
export const EFFECT_BIT_OFFSET = 0

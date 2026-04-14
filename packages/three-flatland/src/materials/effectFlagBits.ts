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
 * | `.z` | Reserved — per-sprite layer bitmask (24 layers, Unity-style)       | — |
 * | `.w` | Reserved — per-sprite integer ID (hit-test / category / sort key)  | — |
 *
 * Notes on reserved components:
 *
 * - **Per-sprite layer bitmask (.z)**: Three.js's own `Object3D.layers` lives
 *   on the `SpriteBatch` mesh, not per-instance, and covers camera-visibility
 *   filtering at the whole-batch granularity — no instance attribute is
 *   needed for that path. The `.z` bitmask is reserved strictly for
 *   per-sprite shader-side filtering (one camera sees some instances of a
 *   shared batch but not others), a future extension.
 *
 * - **Per-sprite integer ID (.w)**: Dual-purpose reservation —
 *   - **Hit-testing / picking**: renders into a picking pass where each
 *     instance emits its ID as color; pixel read-back returns the ID under
 *     the cursor. See the hit-testing branch for the consumer-side logic.
 *   - **Category / secondary sort key**: opaque integer tag usable by CPU
 *     code or a shader predicate. Does not control draw order on its own
 *     (see z-sort note below).
 *
 *   24-bit mantissa comfortably holds a unique ID for up to 16M live
 *   instances. Either use overlaps the other as long as the project picks
 *   one semantic per build; if both are needed simultaneously, split the
 *   24 bits (e.g., low 16 = hit-test ID, high 8 = category).
 *
 * - **Z-sort / y-sort ordering does NOT go here.** Instance render order is
 *   controlled by the SpriteBatch slot sequence, not a packed attribute;
 *   sorting reshuffles slots in place and does not require a rebatch.
 *   Changing an instance's z-index, layer index, or Object3D.layers does
 *   not alter the batch's material identity, so no re-assignment is needed
 *   either.
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

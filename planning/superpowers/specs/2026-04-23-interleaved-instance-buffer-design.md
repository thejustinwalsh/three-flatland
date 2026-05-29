# Interleaved Instance Buffer + Pure Effect Buffers

**Date:** 2026-04-23
**Scope:** Replace SpriteBatch's three separate core vertex buffers (`instanceUV`, `instanceColor`, `instanceFlip`) and the reserved-slot hack in `effectBuf0` with a single interleaved buffer carrying all system/core data. `effectBuf*` becomes pure MaterialEffect storage with no system reservations. Applies equally to SpriteBatch, TileLayer, and standalone Sprite2D geometry.

## 1. Motivation

Two coupled problems:

1. **Vertex-buffer overflow.** WebGPU caps render pipelines at 8 vertex-buffer bindings. SpriteBatch sits exactly at 8: 3 from PlaneGeometry (position/normal/uv), 1 from InstancedMesh (instanceMatrix), 3 core custom (instanceUV/instanceColor/instanceFlip), 1 effect custom (effectBuf0). Any new per-instance datum — including the shadow-radius work just shipped — hits the cap. The just-landed `effectBuf0.z` move works around this but is fragile (see #2).
2. **Effect-slot collision hazard.** `EffectMaterial._rebuildEffectBufferAttributes` reserves `effectBuf0.x` (system flags) and `effectBuf0.y` (enable bits). The shadowRadius work packed a *third* system datum into `effectBuf0.z`, but the effect-field allocator still starts at offset 2 (`effectBuf0.z`). No currently-registered effect has per-instance uniform fields, so the collision is latent — but the first effect that does would silently overwrite shadowRadius. This is a correctness bug waiting for a triggering commit.

The fix is the same for both: move all system/core per-instance data into a single interleaved buffer that stays out of `effectBuf*` entirely, and let `effectBuf0` start its field offsets at 0.

## 2. Design

### 2.1 Layout

One `InstancedInterleavedBuffer`, stride 64 bytes (16 floats) per instance, bound as four `InterleavedBufferAttribute`s at a single vertex-buffer binding:

| Attribute | Offset (floats) | Type | Contents |
|---|---|---|---|
| `instanceUV` | 0 | vec4 | (x, y, w, h) — existing semantics |
| `instanceColor` | 4 | vec4 | (r, g, b, a) — existing semantics |
| `instanceSystem` | 8 | vec4 | (flipX, flipY, sysFlags, enableBits) |
| `instanceExtras` | 12 | vec4 | (shadowRadius, reserved, reserved, reserved) |

`instanceSystem.x/.y` replaces the standalone `instanceFlip` attribute. `instanceSystem.z/.w` replaces `effectBuf0.x/.y`'s former system-flag and enable-bit slots. `instanceExtras.x` replaces `effectBuf0.z`'s current shadowRadius slot.

Three reserved slots in `instanceExtras.y/.z/.w` absorb the future per-sprite layer bitmask, picking ID, and softness-hint concepts documented in commit `f0d2ba1`.

### 2.2 Buffer-binding budget

| # | Buffer | Before | After |
|---|---|---|---|
| 1–3 | position / normal / uv | ✓ | ✓ |
| 4 | instanceMatrix | ✓ | ✓ |
| 5 | **instanceCore** (interleaved) | — | ✓ (new — replaces 3 old bindings) |
| — | instanceUV / instanceColor / instanceFlip (separate) | ✓✓✓ | merged into #5 |
| 6 | effectBuf0 | ✓ (w/ reservations) | ✓ (pure effect, 4 slots) |
| 7 | effectBuf1 | available | available |
| 8 | effectBuf2 | available | available |

Three buffer bindings freed. `effectBuf0` gains 2 slots (the old reservations) back as pure effect capacity. Tier-0 effect capacity goes from 2 floats to 4 floats; tier-1 from 6 to 8; tier-2 from 10 to 12.

### 2.3 Attribute-location budget

Counting shader attribute locations (WebGPU `maxVertexAttributes` cap = 16):

| Attribute | Locations used |
|---|---|
| position, normal, uv | 3 |
| instanceMatrix (mat4) | 4 |
| instanceUV, instanceColor, instanceSystem, instanceExtras | 4 |
| effectBuf0–2 (up to 3 vec4s) | 3 |
| **Total ceiling** | **14** |

Two locations of headroom remain under the 16-location cap for future growth.

### 2.4 Effect-slot allocator change

`EffectMaterial._rebuildEffectBufferAttributes` currently starts the effect-field offset at 2 (past the system reservations). After this spec, it starts at 0.

`EffectMaterial.getMaxEffectFloats()` returns `3 * 4 = 12` — the budget of pure effect floats available across effectBuf0/1/2 given the other fixed bindings. `registerEffect` throws when an addition would push total effect floats past 12:

```
"Material exceeds effect data cap (12 floats per instance, WebGPU 8-buffer limit).
 Registered: [list], attempted: [new]. Reduce a schema or consolidate effects."
```

### 2.5 Reader migration

| Helper | Current read | New read |
|---|---|---|
| `readCastShadowFlag()` | `effectBuf0.x` (bit 2) | `instanceSystem.z` (bit 2) |
| `readReceiveShadowsFlag()` | `effectBuf0.x` (bit 1) | `instanceSystem.z` (bit 1) |
| `readShadowRadius()` | `effectBuf0.z` | `instanceExtras.x` |
| `wrapWithLightFlags` (lit bit) | `effectBuf0.x` (bit 0) | `instanceSystem.z` (bit 0) |

Public helper signatures unchanged — only the internal attribute name + component index change.

The `bit 0/1/2` bitfield layout inside the flags word is unchanged — `LIT_FLAG_MASK`, `RECEIVE_SHADOWS_MASK`, `CAST_SHADOW_MASK` constants keep their values. The flags word just lives in `instanceSystem.z` instead of `effectBuf0.x`.

### 2.6 Writer migration

Per-instance data writes move to new methods on SpriteBatch:

| Existing | Purpose | Keeps working? |
|---|---|---|
| `writeUV(index, x, y, w, h)` | UV quad | ✓ (writes into interleaved buffer at offset 0) |
| `writeColor(index, r, g, b, a)` | Color + alpha | ✓ (offset 4) |
| `writeFlip(index, flipX, flipY)` | Flip | ✓ (writes `instanceSystem.x/.y` = offset 8/9) |
| `writeEffectSlot(index, bufIdx, comp, val)` | Effect field data | ✓ (effectBuf* only, no system reservation) |
| *new* `writeSystemFlags(index, flags)` | lit/receive/cast bits | Writes `instanceSystem.z` (offset 10) |
| *new* `writeEnableBits(index, bits)` | MaterialEffect enable bits | Writes `instanceSystem.w` (offset 11) |
| *new* `writeShadowRadius(index, r)` | Per-instance occluder radius | Writes `instanceExtras.x` (offset 12) |

Dirty-range tracking uses a single min/max for the whole interleaved buffer (flushed as one `addUpdateRange` over the entire stride span).

### 2.7 Files touched

| File | Change |
|---|---|
| `packages/three-flatland/src/pipeline/SpriteBatch.ts` | Interleaved buffer allocation, new writers, unified dirty tracking |
| `packages/three-flatland/src/sprites/Sprite2D.ts` | Standalone geometry: same interleaved layout. Flag/radius write helpers target new offsets |
| `packages/three-flatland/src/tilemap/TileLayer.ts` | Same interleaved layout per chunk. System flags + tile radius written to `instanceSystem.z` / `instanceExtras.x` |
| `packages/three-flatland/src/lights/wrapWithLightFlags.ts` | Readers switch attribute names |
| `packages/three-flatland/src/materials/EffectMaterial.ts` | Effect-slot offset starts at 0; `getMaxEffectFloats()` / overflow throw |
| `packages/three-flatland/src/materials/Sprite2DMaterial.ts` | `colorNode` reads switch from `instanceFlip` → `instanceSystem.xy` |
| `packages/three-flatland/src/lights/OcclusionPass.ts` | Same (`instanceFlip` read → `instanceSystem.xy`) |
| `packages/three-flatland/src/ecs/systems/transformSyncSystem.ts` | Per-frame shadow radius write targets `writeShadowRadius` not `writeEffectSlot` |

### 2.8 Tests to update / add

- `castsShadow.test.ts` — assertions inspecting `effectBuf0.x` bits now inspect `instanceSystem.z`.
- `Sprite2D.test.ts` — existing shadowRadius tests need no change (use the public getter).
- `EffectMaterial` tests — add `getMaxEffectFloats()` returns 12; throws on 13th-float registration.
- New: SpriteBatch interleaved-buffer layout test — writes via each helper land at the expected Float32Array offsets.

## 3. Non-goals

- No changes to `instanceMatrix` semantics or bindings.
- No changes to how MaterialEffects author their schemas.
- No new user-facing API surface on Sprite2D, Light2D, LightEffect, or MaterialEffect.
- No change to `effectBuf0`/`effectBuf1` tier growth logic beyond starting field offsets at 0.
- No WebGL 1 support path (out of repo scope per existing policy).

## 4. Order of work

1. Write interleaved buffer infrastructure in SpriteBatch (no readers changed yet — shader still reads old attributes, which no longer exist → intentionally-broken state, confined to one commit).
2. Switch reader helpers in `wrapWithLightFlags.ts` and `Sprite2DMaterial.ts`/`OcclusionPass.ts` that read `instanceFlip`.
3. Parallel changes to Sprite2D standalone + TileLayer.
4. Effect-slot allocator starts at 0 + `getMaxEffectFloats()` + overflow throw.
5. Update tests.
6. Verify full branch green — tests + typecheck + demo smoke.

Each step is its own commit with gates.

## 5. Validation

- Automated: 639+ tests still pass; new tests cover interleaved-layout offsets and effect-cap enforcement.
- Visual: dungeon demo renders identically. No self-shadow regression. No sprite-flip regression. No color/alpha regression. Shadow radii still per-sprite auto-resolved.
- Performance: per-instance buffer upload cost should be slightly higher (larger stride-per-write) but still sub-ms at 1000 instances. Pipeline creation cost drops (fewer bindings). Net frame time should be within ±0.5 ms of current.

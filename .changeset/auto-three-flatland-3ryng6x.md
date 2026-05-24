---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## 2D Lighting System

- Full Forward+ tiled lighting pipeline: JFA-based signed SDF occlusion, per-tile light culling, OcclusionPass render target
- `SDFGenerator`: dual JFA chains produce signed SDF (inside + outside distances) packed into a single RGBA ping-pong at the same VRAM cost as the previous unsigned generator; 5-tap separable binomial blur for smooth transitions
- `OcclusionPass`: lifecycle-managed render target, per-instance `castsShadow` alpha masking
- Forward+ tile size bumped 16 → 32px, cutting CPU tile-assignment cost by ~4× at high light counts
- Reservoir-based tile overflow culls by `Light2D.importance`; hero lights never evicted by fill lights
- Per-tile fill-light quota (max 2 per tile, per category); fill lights that miss a slot contribute to per-category luminance compensation
- `Light2D.category` hashes to one of 4 independent fill buckets via djb2; each category has its own quota and compensation scale
- `Light2D.importance` (default `1.0`) — multiplicative bias on tile-ranking score
- `Light2D.castsShadow` field, bit-packed into the instance buffer; fill lights (`castsShadow: false`) skip the 32-tap SDF trace
- Per-sprite `shadowRadius` with auto scale-derived default; replaces scene-wide `shadowStartOffset` uniform; preserved across `clone()`
- SDF texture and world bounds threaded through `LightEffectBuildContext` (T5/T7)
- Shadow pipeline state moved to ECS trait + system
- CPU tile-bound calculation aligned with shader's screen-pixel stride math — eliminates tile-edge checkerboard gaps at non-multiple-of-TILE_SIZE viewport heights
- Dev-time warning for unsatisfied channel providers

## Instance Buffer Layout

- Core per-instance data interleaved into a single `InstancedInterleavedBuffer` with four attribute views: `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras` — collapses 3 vertex buffer bindings into 1, staying under WebGPU's `maxVertexBuffers=8` cap
- `effectBuf*` is now pure `MaterialEffect` data; the effect-slot allocator starts at offset 0
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` throws a clear error at `registerEffect` time when cumulative effect data would exceed the 3-buffer cap
- TSL attribute helpers moved to `materials/instanceAttributes.ts`: `readFlip`, `readSystemFlags`, `readEnableBits`, `readLitFlag`, `readShadowRadius`, `readCastShadowFlag`; all re-exported from the `three-flatland/lights` barrel

## Loaders

- `skipBakedProbe` renamed to `forceRuntime` on `SpriteSheetLoader`, `LDtkLoader`, and `TiledLoader` to match `SlugFontLoader`'s existing flag
- `disableRuntimeBake` removed; requesting normals always triggers the runtime bake fallback unless `forceRuntime: true`

## Debug Protocol

- Devtools bus with BroadcastChannel transport + pool + worker offloading, zero-alloc hot path
- Delta-encoded stats packets; env producer; timestamps; multi-provider discovery
- Debug buffer registration and streaming; SDF and occlusion textures registered as debug textures
- Bus-worker module resolved without extension so bundlers pick `bus-worker.ts` (source) or `bus-worker.js` (dist) correctly

## BREAKING CHANGES

- `skipBakedProbe` option renamed to `forceRuntime` on `SpriteSheetLoader`, `LDtkLoader`, and `TiledLoader`
- `disableRuntimeBake` option removed from all loaders
- `RadianceCascades` removed from `three-flatland/lights` exports (deferred to a follow-up PR)

This release ships the complete 2D Forward+ lighting pipeline with signed SDF shadow tracing, per-sprite shadow radii, per-category fill-light quotas, and a unified debug bus for live GPU buffer inspection.

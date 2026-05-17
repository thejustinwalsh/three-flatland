---
"three-flatland": minor
---

> Branch: fix-sprite-sort-regression
> PR: https://github.com/thejustinwalsh/three-flatland/pull/28

## Sprite sorting, alphaTest fast path, and interleaved buffer refactor

### Sprite z-ordering

- Added `batchSortSystem` — runs after `transformSyncSystem`, re-sorts batch instance slots by `zIndex` each frame; gated on `Changed(SpriteZIndex)` so only dirty batches are touched
- `SpriteBatch.swapSlots(a, b)` permutes all GPU buffer rows (matrix, UV, color, flip, all effect buffers) in lockstep; hole-preserving so the free list stays valid
- `Sprite2D.zIndex` setter now writes to the ECS `SpriteZIndex` component so Koota's `Changed` tracker fires; `batchAssignSystem` fires it once on first assignment for an initial sort
- All scratch arrays are module-scope and reused frame-to-frame (zero allocations on the hot path)

### alphaTest opt-in and sort fast path

- `Sprite2DMaterialOptions.alphaTest` is now fully wired end-to-end; setting it > 0 flips the material to `transparent=false, depthWrite=true` and the shader discards fragments below the threshold
- `Sprite2DMaterial.getShared()` cache key includes `alphaTest` so different cutoff values get distinct shared instances
- `batchSortSystem` short-circuits entirely for any batch whose material has `alphaTest > 0 && depthWrite=true` — the GPU depth test handles ordering for free via the `pz` value baked into the instance matrix by `transformSyncSystem`
- `Sprite2D.zIndex` setter skips the ECS `Changed` write when the sort gate applies, preventing Koota from enumerating per-frame flips before `batchSortSystem` can bail

### Sort performance

- `batchSortSystem` Pass 0 precomputes `gatedBatches[]` once per frame from material state
- Swap permutation: O(n²) linear search replaced with an inverse `slotToScratchIdx Int32Array`, maintained in lockstep — O(n) per batch
- Sort: hand-rolled insertion sort (O(n²) cold-start) replaced with `Array.prototype.sort` (V8 TimSort — O(n) near-sorted, O(n log n) worst case)
- Knightmark @ 10k sprites: 30 fps (22 ms in `batchSortSystem`) → 60 fps+; system cost near-zero after the setter gate

### Alpha discard fix

- Default 0.01 discard cutoff now tests `texColor.a` only, not `texColor.a * instanceColor.a`; sprites faded via instance color alpha were having semi-transparent texels incorrectly discarded, hardening edges during fade-out
- User-facing `alphaTest` threshold still applies to the combined `finalAlpha` (correct — the user asked for the cutoff post-fade)
- Premultiplied branch unchanged; its discard path was already correct

### Interleaved core buffer refactor

- `SpriteBatch` replaces three separate per-instance attributes (`instanceUV`, `instanceColor`, `instanceFlip`) with one `InstancedInterleavedBuffer` (stride 16) exposing four logical `InterleavedBufferAttribute` views: `instanceUV` (offset 0), `instanceColor` (4), `instanceSystem` (8 — flipX, flipY, sysFlags, enableBits), `instanceExtras` (12 — shadowRadius + reserved)
- Vertex buffer slot count drops from `3+1+3+N` to `3+1+1+N`, freeing 2 slots under WebGPU's `maxVertexBuffers=8` cap
- New `writeEnableBits` / `writeSystemFlags` / `writeShadowRadius` methods on `SpriteBatch`; `swapSlots` / `freeSlot` / `flushDirtyRanges` updated for the consolidated buffer; one `BucketedDirtyTracker` drives the whole interleaved buffer
- `BucketedDirtyTracker` constructor accepts either `InstancedBufferAttribute` or `InstancedInterleavedBuffer` via an `UploadTarget` structural type
- `EffectMaterial`: effect-slot allocator starts at offset 0 (flags moved to `instanceSystem.w`); added `MAX_EFFECT_FLOATS = 12` cap with a clear error at `registerEffect` instead of a cryptic WebGPU pipeline rejection at draw time
- `Sprite2DMaterial` shader reads flip from `instanceSystem.xy` (was `instanceFlip`)
- `TileLayer` per-tile attribute updated from `instanceFlip` (vec2) to `instanceSystem` (vec4) to match the shared shader
- `bufferSyncSystem.ts` deleted — all sync paths were dead code or are now handled by direct-write in `addEffect`/`removeEffect`
- Standalone `Sprite2D` path mirrors batched layout: `_instanceFlipBuffer` (vec2) replaced with `_instanceSystemBuffer` + `_instanceExtrasBuffer` (both vec4)
- Knightmark with effects enabled sustains ~27k sprites at 60 fps on M2 Mac, matching the no-effects baseline

This release resolves the sprite sort regression, adds an `alphaTest`-based depth-test fast path for opaque/pixel-art sprites, and consolidates per-instance GPU buffers to free vertex buffer slots for future effect data and lighting integration.

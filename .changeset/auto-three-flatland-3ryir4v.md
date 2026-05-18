---
"three-flatland": minor
---

> Branch: fix-sprite-sort-regression
> PR: https://github.com/thejustinwalsh/three-flatland/pull/28

## Sprite sort regression fix + interleaved buffer refactor

### Sprite sorting

- Add `batchSortSystem` — re-sorts instanced batch slots by `zIndex` each frame, gated on `Changed(SpriteZIndex)` so only dirty batches pay the cost
- `SpriteBatch.swapSlots(a, b)` permutes all GPU buffer rows (matrix, UV, color, flip, effect data) in lockstep; entity IDs never move
- `batchAssignSystem` fires an initial `SpriteZIndex` set on first assignment so newly-added sprites trigger a sort
- `Sprite2D.zIndex` setter now calls `entity.set(SpriteZIndex, ...)` to register with Koota's `Changed` tracker

### `alphaTest` opt-in (new feature)

- `Sprite2DMaterialOptions.alphaTest` — when `> 0`, sets `transparent=false` + `depthWrite=true` and discards fragments below the threshold; GPU depth test resolves draw order for free, bypassing CPU sort entirely
- `Sprite2DMaterial.getShared()` cache key now includes `alphaTest` so distinct cutoff values return distinct shared instances
- `batchSortSystem` skips any batch whose material has `alphaTest > 0 && depthWrite` — near-zero per-frame cost for pixel-art / hard-edge sprites

### Sort performance improvements

- Swap-permutation pass: replaced O(n²) linear search with an inverse `slotToScratchIdx` Int32Array, maintained in lockstep — O(n) per batch
- Sort pass: replaced hand-rolled insertion sort (O(n²) cold) with `Array.prototype.sort` (V8 TimSort — O(n) steady-state, O(n log n) worst case)
- `Sprite2D.zIndex` setter short-circuits `entity.set()` when the `alphaTest+depthWrite` gate applies, preventing Koota's `Changed` tracker from accumulating entries before the system can bail
- Knightmark @ 10k: 30fps (22ms sort cost) → 60fps+, sort cost near-zero after the setter gate

### Interleaved per-instance buffer (`SpriteBatch`)

- Replace three separate attributes (`instanceUV`, `instanceColor`, `instanceFlip`) with one `InstancedInterleavedBuffer` (stride 16) exposing four logical views: `instanceUV` (0), `instanceColor` (4), `instanceSystem` (8 — flipX, flipY, sysFlags, enableBits), `instanceExtras` (12)
- Vertex-buffer count drops from `3+1+3+N` to `3+1+1+N`, freeing 2 slots under WebGPU's `maxVertexBuffers=8` cap and unblocking materials that need more effect data
- New `writeEnableBits` / `writeSystemFlags` / `writeShadowRadius` methods on `SpriteBatch`
- `BucketedDirtyTracker` now accepts either `InstancedBufferAttribute` or `InstancedInterleavedBuffer` via a structural `UploadTarget` type

### Effect system changes

- `EffectMaterial`: effect-slot allocator starts at offset 0 (flags moved to `instanceSystem.w`); `effectBuf*` is now pure user data with no reserved slots
- `MAX_EFFECT_FLOATS = 12` cap with a clear error at `registerEffect` time instead of a cryptic WebGPU pipeline rejection at draw time
- `bufferSyncSystem.ts` deleted — all sync (color, UV, flip, effect) now direct-writes through `_batchMesh` / `_batchSlot`; per-frame system loop loses one pass

### Per-instance factory pattern (state isolation)

- `batchAssignSystem`, `batchReassignSystem`, `batchRemoveSystem`, `batchSortSystem`, and `sceneGraphSyncSystem` converted to `createXxxSystem()` factories; each `SpriteGroup` closes over its own scratch arrays and Koota subscriptions
- Eliminates shared module-scope mutable state: scratch no longer grows to the high-water mark of the largest group, per-frame `new Set()` allocations eliminated, test isolation no longer depends on `universe.reset()`

### Bug fixes

- Default discard cutoff (`0.01`) now tests `texColor.a` only, not `texColor.a * instanceColor.a` — sprites faded via `instanceColor.a` no longer have edges hardened during fade-out; user-set `alphaTest` still applies to the combined alpha
- Latent flags-write in `batchReassignSystem` corrected: was writing to `effectBuf0[0]` (pre-interleaved offset) instead of `instanceSystem.w` via `writeEnableBits`

Fixes the sprite sort regression introduced in the interleaved buffer migration and adds an `alphaTest`-gated fast path that eliminates CPU sort cost entirely for opaque pixel-art sprites.

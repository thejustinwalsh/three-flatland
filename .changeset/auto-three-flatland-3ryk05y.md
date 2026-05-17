---
"three-flatland": minor
---

> Branch: fix-sprite-sort-regression
> PR: https://github.com/thejustinwalsh/three-flatland/pull/28

## Sprite Sort, Interleaved Buffer, and alphaTest Fast Path

### Features

- `Sprite2DMaterialOptions.alphaTest` — when set > 0, opts the material into an opaque depth-test fast path: `transparent=false`, `depthWrite=true`, shader discards fragments with `finalAlpha < alphaTest`. Pixel-art sprites with hard edges (e.g. Knightmark) should use this
- `Sprite2DMaterial.getShared()` cache key includes `alphaTest` so different cutoff values return distinct shared instances
- `batchSortSystem` short-circuits entirely for batches with `alphaTest > 0 && depthWrite=true` — the GPU depth test resolves draw order for free via the `pz` baked into each instance matrix

### Fixes

- Default 0.01 discard cutoff now applies to `texColor.a` only, not `texColor.a * instanceColor.a` — sprites fading via `instanceColor.a` were incorrectly having texels in [0.01, 0.02) discarded, hardening edges during fade-out
- Batch instance slots are now re-sorted by `zIndex` each frame via `batchSortSystem`, which runs after `transformSyncSystem` and before `sceneGraphSyncSystem`, gated on `Changed(SpriteZIndex)`
- `Sprite2D.zIndex` setter now triggers Koota's `Changed` tracker so newly-assigned and updated zIndex values are picked up by `batchSortSystem`
- Fixed latent flags-write in `batchReassignSystem`: was writing to `effectBuf0[0]` (pre-interleaved layout) instead of `instanceSystem.w` via `writeEnableBits`

### Performance

- `batchSortSystem` batch swap: replaced O(n²) linear search with an O(n) inverse `slotToScratchIdx` index maintained in lockstep during swaps
- `batchSortSystem` sort: replaced hand-rolled O(n²) insertion sort with `Array.prototype.sort` (V8 TimSort) — eliminates a 400M-comparison cliff at 20k sprites
- `Sprite2D.zIndex` setter short-circuits the `entity.set(SpriteZIndex)` call when the alphaTest gate applies, preventing unnecessary `Changed` enumerations
- Knightmark @ 10k: 30fps (22ms in batchSortSystem) → 60fps+, batchSortSystem cost near-zero after gate + sort fixes

### Internal

- **Interleaved core buffer:** `SpriteBatch` replaces separate `instanceUV`, `instanceColor`, and `instanceFlip` attributes with one `InstancedInterleavedBuffer` (stride 16), exposing four logical views: `instanceUV` (offset 0), `instanceColor` (4), `instanceSystem` (8 — flipX, flipY, sysFlags, enableBits), `instanceExtras` (12). Vertex-buffer count drops from `3+1+3+N` to `3+1+1+N`, freeing 2 slots under WebGPU's `maxVertexBuffers=8` cap
- New `SpriteBatch` methods: `writeEnableBits`, `writeSystemFlags`, `writeShadowRadius`; `BucketedDirtyTracker` accepts both `InstancedBufferAttribute` and `InstancedInterleavedBuffer`
- `EffectMaterial`: effect-slot allocator starts at offset 0 (flags moved to `instanceSystem.w`); added `MAX_EFFECT_FLOATS = 12` cap with a clear error thrown at `registerEffect` instead of a cryptic WebGPU pipeline rejection at draw time
- `bufferSyncSystem.ts` deleted — color, UV, flip, and effect sync now happens via direct-write in `addEffect`/`removeEffect`; per-frame system loop loses one pass
- All ECS systems with mutable state converted to `createXxxSystem()` factories — each `SpriteGroup` instance now has independent scratch arrays and change-tracking state, eliminating cross-group interference and high-water-mark overhead

### BREAKING CHANGES

- **Effect buffer offsets shifted:** `effectBuf*` data now starts at offset 0 per slot (previously offset 1, since slot 0 was reserved for enable flags). Custom effects that packed data starting at index 1 must shift reads/writes down by 1
- **`instanceFlip` attribute removed:** shader reads flip from `instanceSystem.xy`; custom materials or shaders referencing `instanceFlip` must update to `instanceSystem`
- **`bufferSyncSystem` removed:** any direct import of `bufferSyncSystem` will fail; the sync it performed is now handled automatically by the direct-write path

This release resolves the sprite sort regression on multi-group scenes, ships the interleaved buffer layout that unblocks future lighting and effect expansion, and adds the `alphaTest` fast path that eliminates CPU sort overhead for opaque pixel-art sprites.

---
"three-flatland": minor
---

> Branch: fix-sprite-sort-regression
> PR: https://github.com/thejustinwalsh/three-flatland/pull/28

## New Features

- `Sprite2DMaterialOptions.alphaTest` is now fully wired end-to-end. Setting it to a value > 0 switches the material to `transparent=false` / `depthWrite=true` and discards fragments where `finalAlpha < alphaTest`. Distinct cutoff values produce distinct shared material instances.
- Pixel-art and hard-edge sprites can opt in to GPU depth-test ordering by setting `alphaTest`, skipping CPU sort entirely — no per-frame `batchSortSystem` work for those batches.

## Performance

- `batchSortSystem` now gates on material properties at frame start: batches with `alphaTest > 0 && depthWrite` are skipped entirely, so scenes like Knightmark pay near-zero sort cost.
- Slot swap permutation rewritten from O(n²) linear search to O(n) using an inverse `slotToScratchIdx` lookup maintained in lockstep during swaps.
- Per-batch sort upgraded from hand-rolled insertion sort (O(n²) cold-start) to `Array.prototype.sort` (V8 TimSort, O(n) near-sorted, O(n log n) worst case) — eliminates a ~400M-comparison cliff at 20k sprites.
- `Sprite2D.zIndex` setter short-circuits the Koota `entity.set(SpriteZIndex, …)` call for gated materials, preventing the ECS Changed tracker from accumulating entries that `batchSortSystem` would only skip anyway.
- Combined effect: Knightmark at 10k sprites went from 30 fps (22 ms in sort) to 60+ fps; sort cost drops to near-zero after the setter gate.
- Consolidated three separate per-instance GPU attributes (`instanceUV`, `instanceColor`, `instanceFlip`) into one `InstancedInterleavedBuffer` (stride 16), reducing vertex-buffer slot usage from `3+1+3+N` to `3+1+1+N` — frees two slots under WebGPU's `maxVertexBuffers=8` cap and allows more effect data buffers.
- Removed `bufferSyncSystem` pass entirely; color, UV, flip, and effect data are now written directly at mutation sites, saving one full-world pass per frame.
- All ECS systems with non-trivial state converted to `createXxxSystem()` factories, giving each `SpriteGroup` independent scratch arrays and change-tracking state — no shared high-water-mark growth, no GC from per-call `new Set()`.

## Bug Fixes

- Fixed sprite fade-out edge hardening: the default 0.01 discard cutoff now tests `texColor.a` only (pure transparency skip), not `texColor.a * instanceColor.a`. Sprites faded via `instanceColor.a` no longer lose texels in the `[0.01, 0.02)` range. The `alphaTest` opt-in continues to test combined alpha, as intended.
- Fixed `batchSortSystem` not re-sorting batched sprites by `zIndex` each frame; GPU instance rows are now permuted in-place via `SpriteBatch.swapSlots`, preserving the free-list and all effect buffer rows.
- Fixed latent flags-write in `batchReassignSystem`: was writing enable-bits to `effectBuf0[0]` (old layout) instead of `instanceSystem.w`.

## Internals

- `BucketedDirtyTracker` constructor accepts both `InstancedBufferAttribute` and `InstancedInterleavedBuffer` via a shared `UploadTarget` structural type.
- `EffectMaterial` effect-slot allocator now starts at offset 0 (flags moved to `instanceSystem.w`); `effectBuf*` is pure user data. A `MAX_EFFECT_FLOATS = 12` hard cap replaces the previous silent WebGPU pipeline rejection.
- `Sprite2DMaterial` shader reads flip from `instanceSystem.xy` (was `instanceFlip`); `TileLayer` updated to match with a `vec4` attribute.
- `Sprite2D` standalone path now mirrors the batched attribute layout (`_instanceSystemBuffer` vec4 + `_instanceExtrasBuffer` vec4).

Resolves the sprite sort regression on PR #28; Knightmark with effects enabled sustains ~27k sprites at 60 fps on M2 Mac, matching the pre-effects baseline.

---
"three-flatland": minor
---

> Branch: fix-sprite-sort-regression
> PR: https://github.com/thejustinwalsh/three-flatland/pull/28

### Sprite z-sorting — correctness fix and performance opt-in

**Core fix (re-sort batch instance slots by zIndex each frame)**
- Adds `batchSortSystem` running after `transformSyncSystem` and before `sceneGraphSyncSystem` — sprites now render in correct zIndex order within a batch
- Gated on `Changed(SpriteZIndex)`: only batches with a zIndex change this frame are re-sorted; unchanged batches pay zero CPU cost
- `SpriteBatch.swapSlots(a, b)` swaps instanceMatrix, UV, color, flip, and all custom effect buffer rows in lockstep; free-list and entity IDs are unaffected
- `Sprite2D.zIndex` setter now triggers Koota's `Changed` tracker; `batchAssignSystem` fires it once on first slot assignment so newly-added sprites sort immediately
- All sort scratch arrays are module-scope and reused frame-to-frame for zero-alloc hot paths
- 234-line test suite added (`batchSort.test.ts`) covering sort correctness, no-op frames, and the alphaTest gate

**`alphaTest` opt-in for pixel-art / opaque sprites**
- `Sprite2DMaterialOptions.alphaTest` is now fully supported: when `> 0`, the material defaults to `transparent=false`, `depthWrite=true`, and the TSL shader discards fragments where `finalAlpha < alphaTest`
- `Sprite2DMaterial.getShared()` dedup key now includes `alphaTest`, so different cutoff values produce distinct cached instances
- `batchSortSystem` short-circuits any batch whose material has `alphaTest > 0 && depthWrite` — GPU depth test resolves draw order without CPU sorting
- Knightmark demo updated to use `alphaTest: 0.5` (hard-edge pixel-art atlas), opting into the depth-test fast path

**Internal / CI**
- Fixed `prefer-const` lint error on `batchEntityBuckets` in `batchSortSystem` that was blocking CI on PR #28

Fixes sprite z-ordering within batches for transparent sprites (CPU sort) and adds a GPU depth-test fast path for opaque/pixel-art sprites via `alphaTest`.

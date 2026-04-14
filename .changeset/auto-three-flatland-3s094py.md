---
"three-flatland": minor
---

> Branch: fix-sprite-sort-regression
> PR: https://github.com/thejustinwalsh/three-flatland/pull/28

## Sprite z-sort regression fix

### Batch sort system

- Added `batchSortSystem` — runs after `transformSyncSystem`, before `sceneGraphSyncSystem`
- Only re-sorts batches whose sprites had a `zIndex` change this frame (`Changed(SpriteZIndex)` gate), avoiding unnecessary work
- Sorts occupied instance slots by `zIndex` ascending using insertion sort (near-sorted after the first frame → O(n) in practice)
- Permutes GPU rows (instanceMatrix, UV, color, flip, custom effect buffers) in-place via new `SpriteBatch.swapSlots(a, b)`; physical free-list holes are preserved
- All scratch storage is module-scoped and reused frame-to-frame — zero allocations in the hot path
- `Sprite2D.zIndex` setter now emits `entity.set(SpriteZIndex, …)` so Koota's change tracker fires; `batchAssignSystem` fires it once on first slot assignment to trigger initial sort

### `alphaTest` opt-in for GPU depth-test fast path

- `Sprite2DMaterialOptions.alphaTest` is now wired end-to-end on `Sprite2DMaterial`
- When `alphaTest > 0` the material defaults to `transparent = false` and `depthWrite = true`; TSL shader discards fragments where `finalAlpha < alphaTest`
- `batchSortSystem` skips any batch whose material has `alphaTest > 0 && depthWrite` — GPU depth test (fed by the layer/zIndex-derived `pz` baked into the instance matrix) resolves draw order, making CPU sorting unnecessary
- `Sprite2DMaterial.getShared()` cache key now includes `alphaTest` so different cutoff values produce distinct shared instances
- Knightmark example updated to use `alphaTest: 0.5` — pixel-art hard edges make it an ideal candidate for this path

Fixes sprite z-ordering regression for transparent batches and introduces a GPU-side fast path for opaque/cutout sprites, eliminating per-frame CPU sorting overhead for materials with hard alpha edges.

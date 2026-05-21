---
"three-flatland": minor
---

> Branch: fix-sprite-sort-regression
> PR: https://github.com/thejustinwalsh/three-flatland/pull/28

## Bug Fixes

- **Sprite slot corruption after sort** — `BatchSlot` is now the single source of truth for a sprite's physical slot; `InBatch` relation no longer stores a slot field that could go stale after a sort swap, preventing slot zeroing on reassign/remove/material-rebuild
- **Wrong blending when `premultipliedAlpha` differs** — `Sprite2DMaterial.getShared()` now includes `premultipliedAlpha` in its cache key; previously two materials differing only in this flag shared the same cached instance, silently applying the wrong blend mode and `depthWrite` value
- **One-frame zero-matrix flash on new sprites** — patched Three.js `InstanceNode` to propagate `instanceMatrix` upload ranges in `updateBefore` instead of the FRAME phase, eliminating the blank-sprite flicker when a `SpriteBatch` grows its draw count (upstream: mrdoob/three.js#33615)
- **Alpha fade artifacts** — the default 0.01 discard cutoff in `Sprite2DMaterial` now applies to `texColor.a` only, not `finalAlpha`; sprites faded via `instanceColor.a` no longer have their edges hardened during fade-out
- **z-sort correctness** — `batchSortSystem` now re-sorts batch instance slots by `zIndex` each frame; slot permutations are applied via `SpriteBatch.swapSlots()` which keeps `instanceMatrix`, UV, color, flip, and all effect buffers in sync

## Features

- **`alphaTest` option surfaced end-to-end** — `Sprite2DMaterialOptions.alphaTest > 0` sets `transparent=false` + `depthWrite=true` and discards fragments below the threshold; `batchSortSystem` short-circuits entirely for these batches since the GPU depth test handles ordering, included in `getShared()` cache key
- **Anchor baked into matrix** — `Sprite2D` anchor changes no longer trigger a geometry rebuild; `(0.5 - anchor) * scale` is folded into the matrix translation in `updateMatrix`, correct under non-uniform scale and rotation
- **Observable mutation hooks** — new `ObservableStrategy<T>` with `attach` / `snapshot` for `Color`, `Vector2`, `Vector3`, and `Euler`; consumers can react to in-place mutations of mutable Three.js types without prop reassignment

## Performance

- **`batchSortSystem` O(n) swap + TimSort** — swap permutation now uses an inverse `slotToScratchIdx` Int32Array (O(n)) instead of a linear search (O(n²)); sorting replaced hand-rolled insertion sort with `Array.prototype.sort` (V8 TimSort: O(n) near-sorted, O(n log n) worst case vs O(n²) for 20k+ sprites); Knightmark 10k: 30 fps → 60+ fps
- **`zIndex` setter fast path** — setter skips the ECS `Changed` write when the `alphaTest+depthWrite` gate applies, eliminating Koota change-tracker overhead on gated batches
- **Interleaved core buffer** — `SpriteBatch` replaces three separate `instanceUV` / `instanceColor` / `instanceFlip` attributes with a single `InstancedInterleavedBuffer` (stride 16), dropping vertex buffer count from `3+1+3+N` to `3+1+1+N` and freeing two slots under WebGPU's `maxVertexBuffers=8` cap
- **`EffectMaterial` slot cap** — `registerEffect` now enforces `MAX_EFFECT_FLOATS = 12` with a clear error instead of letting WebGPU reject the pipeline at draw time

## Internal

- ECS systems with per-frame state (`batchAssignSystem`, `batchReassignSystem`, `batchRemoveSystem`, `batchSortSystem`, `sceneGraphSyncSystem`) converted to `createXxxSystem()` factories; each `SpriteGroup` holds its own scratch and change-tracking state, eliminating cross-group interference and high-water-mark overhead
- `bufferSyncSystem` deleted — all buffer writes go direct through `_batchMesh` / `_batchSlot`; per-frame system loop loses one pass

This release fixes the sprite sort regression that caused visual corruption and poor performance in y-sorted scenes, adds the `alphaTest` fast path for pixel-art sprites, and consolidates the per-instance GPU buffer layout to stay within WebGPU's vertex buffer limit as effect counts grow.

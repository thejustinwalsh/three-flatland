---
"three-flatland": minor
---

> Branch: fix-sprite-sort-regression
> PR: https://github.com/thejustinwalsh/three-flatland/pull/28

**Bug fixes**

- Batched sprites now re-sort by `zIndex` each frame; only batches with changed `zIndex` values are processed (`batchSortSystem` gated on `Changed(SpriteZIndex)`)
- `Sprite2DMaterial.getShared()` dedup key now includes `premultipliedAlpha`; missing it caused two materials differing only in that flag to share a cache entry, silently applying wrong blending (`NormalBlending` vs `CustomBlending`) and wrong `depthWrite`
- New sprites added to a `SpriteBatch` no longer flash a zero matrix for one frame; patches three.js `InstanceNode` to propagate `updateRanges` in `updateBefore` (upstream: mrdoob/three.js#33615)
- Default per-texel discard cutoff (0.01) now tests `texColor.a` only, not `finalAlpha`; sprites faded via `instanceColor.a` no longer have edges hardened during fade-out

**New features**

- `Sprite2DMaterialOptions.alphaTest`: set `> 0` to opt into an opaque depth-test fast path — material becomes `transparent=false + depthWrite=true`; GPU depth resolves draw order, bypassing per-frame CPU sort entirely (ideal for hard-edge pixel-art sprites)
- `Sprite2D` anchor is now baked as a translation offset into `updateMatrix`; anchor changes no longer rebuild geometry
- Observable mutation hooks for `Color`, `Vector2`, `Vector3`, `Euler` via `ObservableStrategy<T>` (`attach` + `snapshot`); react to in-place mutations without prop reassignment; exported from `three-flatland` and `three-flatland/react`

**Performance**

- `batchSortSystem` sort: O(n²) insertion sort replaced with V8 `Array.prototype.sort` (TimSort — O(n) on near-sorted steady-state, O(n log n) worst case)
- `batchSortSystem` swap: O(n²) linear slot search replaced with an O(n) inverse-index `Int32Array`
- `batchSortSystem` gate: pre-computed `gatedBatches[]` skips the entire dirty-mark and sort pass for `alphaTest + depthWrite` materials; Knightmark @ 10k improved from 30fps to 60fps+
- `Sprite2D.zIndex` setter short-circuits `entity.set(SpriteZIndex)` when the sort gate applies, suppressing redundant Koota change tracking
- Per-instance attributes consolidated into a single `InstancedInterleavedBuffer` (stride 16; UV / color / system / extras); vertex buffer count drops from `3+1+3+N` to `3+1+1+N`, freeing 2 slots under WebGPU's `maxVertexBuffers=8` cap; effects-enabled Knightmark holds ~27k sprites at 60fps
- `EffectMaterial`: effect-slot offsets now start at 0 (flags moved to `instanceSystem.w`); `registerEffect` throws a clear error when `MAX_EFFECT_FLOATS = 12` is exceeded

**Internal**

- ECS systems with mutable state (`batchAssignSystem`, `batchReassignSystem`, `batchRemoveSystem`, `batchSortSystem`, `sceneGraphSyncSystem`) converted to `createXxxSystem()` factories; scratch arrays and Koota subscriptions are now per-`SpriteGroup`, eliminating cross-group state leakage and per-frame `Set` allocations
- `bufferSyncSystem.ts` removed; all buffer writes are now direct-write at the call site through `addEffect`/`removeEffect`

This release fixes the sprite sort regression introduced in the batching refactor and adds an `alphaTest`-based depth-test fast path that eliminates per-frame CPU sorting for opaque pixel-art sprites. The interleaved per-instance buffer layout reduces vertex buffer pressure under WebGPU's slot limit and prepares the pipeline for the upcoming lighting branch.

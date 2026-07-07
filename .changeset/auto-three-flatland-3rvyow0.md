---
"three-flatland": minor
---

> Branch: feat/sort-layers-orchestration
> PR: https://github.com/thejustinwalsh/three-flatland/pull/141


## Auto-orchestration for vanilla three.js scenes

- Drop a `Sprite2D` into any three.js `Scene` and it now auto-batches with sibling sprites sharing the same run key (material, sortLayer, camera layer mask) — zero setup required. Per-`(renderer, scene)` registries track sprites, default materials, and batches.
- Threshold routing: a lone sprite renders as a standalone mesh (no batch overhead); a second sprite in the same run promotes both to a shared batch. Hysteresis prevents create/destroy flapping around the promotion threshold.
- New `SortLayerGroup` container: bridges first-party sprites and foreign `Object3D`s (Skia, Slug, plain meshes) under one sort-ordering discipline. Exposes `flatland.declareSortLayer(name, config)` and `flatland.sortLayer(name)` for placing foreign objects relative to a layer.
- Default materials are now registry/world-scoped instead of a single cross-world shared cache, so registering an effect on one `Flatland`'s default material no longer leaks into unrelated scenes/worlds.
- Batches expose classification traits (`IsAlphaBlendedBatch`, `IsLitBatch`, `BatchGeometryStrategy`, etc.) via a public `batches` query view (`group.batches` / `registry.batches`).

## Batching and performance

- Batch tier ladder now starts at 1024 slots (was 64) and steps 1024 → 4096 → 16384, cutting per-batch CPU overhead for small-to-medium scenes (~20% faster at matched sprite counts vs. the old ladder).
- Bulk sprite additions size their first batch for the known pending count instead of always starting at the ladder floor.
- Batches synthesize their quad from `vertexIndex` instead of `PlaneGeometry`, freeing 3 WebGPU vertex-buffer bindings. This doubles per-material effect capacity (`MAX_EFFECT_FLOATS` 12 → 24, up to 6 effect buffers).
- `SpriteGroup.maxBatchSize` is now a settable property (previously constructor-only), so it can be set via R3F JSX.
- Explicit `renderOrder` writes on an auto-batched sprite now correctly demote it to standalone rendering in place.

## Fixes

- Fixed a material/texture leak: reassigning a sprite's material no longer leaves the old material's registry entry (and its texture) referenced forever.
- Fixed default-material mutation bug where a sprite holding a shared default material could retexture every sibling in its batch on texture swap.
- Fixed batch eviction reading an undefined slot during effect-tier upgrades, which silently no-op'd slot cleanup.
- Fixed `AnimatedSprite2D` not re-resolving its current frame when swapping `spriteSheet` mid-animation (stale UVs).
- Fixed the missing-`alphaMap` raycast warning being suppressed globally after the first misconfigured sprite instead of per-sprite.
- `EffectMaterial` now validates `effectTier` at construction and throws a clear error if it exceeds the WebGPU buffer cap, instead of failing deep in pipeline creation.
- Silenced three.js's missing-position shader warning for synth-quad geometries (position-less by design; rendering was already correct).
- Fixed several sortLayer/orchestration correctness issues: batch `renderOrder` now derives from the sortLayer's declared numeric order, `Scene.onBeforeRender` re-chains if overwritten, standalone sprites converging on one run key now batch correctly, material dispose hooks are properly detached per-world, and run-key hashing no longer collides at large material counts.

## BREAKING CHANGES

- `Sprite2D.layer` / `{ layer }` construction option renamed to `sortLayer` / `{ sortLayer }`. `sortLayer` accepts a registered name or raw number via the new `SortLayerRegistry` module-augmentation interface (`declareSortLayer`/`getSortLayer`/`resolveSortLayer`).
- `Layers` → `SortLayers`, `LayerManager` → `SortLayerManager` (and its `Layer` type → `SortLayer`) renamed for clarity against three.js's `Object3D.layers` camera bitmask.
- `DEFAULT_BATCH_SIZE` removed in favor of the batch tier ladder (`BATCH_TIER_LADDER`).
- Batch run-key format changed from `(layer, materialId)` to `(materialId, sortLayer, layers.mask)` — camera layer masks now participate in batch grouping.
- Writing `sprite.renderOrder` directly now demotes the sprite out of auto-batching (previously ignored on batched sprites).

Summary: this release ships full auto-orchestration for vanilla three.js scenes (auto-batching, tiered batch sizing, sort-layer groups), doubles per-material effect capacity via synth-quad geometry, and fixes several material-lifecycle and batch-eviction bugs, alongside a breaking rename of `layer` to `sortLayer` across the API.

---
"three-flatland": minor
---

> Branch: feat/sort-layers-orchestration
> PR: https://github.com/thejustinwalsh/three-flatland/pull/141

## Auto-orchestration and batching overhaul

- Sprites in vanilla three.js scenes now auto-register and auto-batch with siblings sharing a run key (material, sort layer, camera layer mask) — zero setup required
- Tiered batch buffers (64 → 256 → 1024 → 4096 → 16384 slots) grow/shrink with hysteresis to avoid create/destroy flapping at the promotion threshold
- New `SortLayerGroup` container bridges first-party sprites and foreign `Object3D`s (Skia, Slug, plain meshes) for consistent sort ordering
- New `flatland.declareSortLayer(name, config)` / `flatland.sortLayer(name)` API for declaring layers and reading their numeric render order
- Default materials are now scoped per world/registry instead of a single global static cache, preventing cross-`Flatland`-instance effect leakage
- Batches carry classification traits (`IsAlphaBlendedBatch`, `IsLitBatch`, `IsUnlitBatch`, `BatchGeometryStrategy`) exposed via `group.batches` / `registry.batches` query views
- Synth-quad geometry (index-only, position derived in the vertex shader) frees 3 vertex-buffer bindings, doubling effect capacity (`MAX_EFFECT_FLOATS` 12 → 24, up to 6 effect buffers)

## Fixes

- Fixed a memory leak where reassigning a sprite's material left the old material (and its texture) permanently referenced in the batch registry
- Fixed animated sprites keeping stale UVs from their previous sprite sheet after a `spriteSheet` swap mid-animation
- Fixed the missing-alphaMap raycast warning being silently suppressed for every sprite after the first one
- Fixed batch eviction on material effect-tier upgrades being a silent no-op, leaking stale batch slots
- Fixed default-material sprites retexturing every sibling sprite in a batch on texture swap instead of re-resolving their own material
- Rejected `effectTier` values exceeding the WebGPU 8-buffer pipeline cap at construction time (previously failed deep inside pipeline creation)
- Silenced three.js's missing-position console warning for synth-quad geometries (expected, harmless) while preserving it for genuine user errors
- Fixed several adversarial-review findings in the sort-layer/orchestration stack: correct `renderOrder` derivation from declared layer order, safe re-chaining of `Scene.onBeforeRender`, dirty-marking for standalone sprites that should batch, per-world material dispose tracking, and 32-bit run-key encoding (previously collided at 65536 batches)
- Internal: removed use of `SpriteGroup`'s deprecated `update()` in favor of an internal `_runScheduleNow()`; deduplicated the batches-view builder between `SpriteGroup` and `Registry`

## BREAKING CHANGES

- `Sprite2D.layer` renamed to `Sprite2D.sortLayer`; the `{ layer }` constructor option is now `{ sortLayer }`
- `SpriteLayer` trait renamed to `SortLayer`; `Layers`/`LayerManager` renamed to `SortLayers`/`SortLayerManager`
- `DEFAULT_BATCH_SIZE` removed in favor of the new batch tier ladder
- Batch run key format changed from `(layer, materialId)` to `(materialId, sortLayer, layers.mask)`

Adds automatic scene-graph batching/orchestration with tiered buffers and per-world default materials, introduces `sortLayer`/`SortLayerGroup` for render ordering, and fixes several material-lifecycle and batch-eviction bugs found during review.

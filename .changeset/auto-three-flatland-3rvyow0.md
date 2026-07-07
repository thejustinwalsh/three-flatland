---
"three-flatland": minor
---

> Branch: feat/sort-layers-orchestration
> PR: https://github.com/thejustinwalsh/three-flatland/pull/141

## Auto-orchestration (sprites outside SpriteGroup/Flatland)

- Drop a `Sprite2D` into any three.js scene and it now auto-registers and auto-batches with siblings sharing the same material/sortLayer/camera-layers-mask, with zero setup
- Batches grow through a tiered ladder (1024 → 4096 → 16384 slots) sized to the run's load; bulk-added scenes size their first batch for the load instead of starting at the floor
- Hysteresis avoids create/destroy flapping at the batch-promotion threshold
- `SpriteGroup.maxBatchSize` can now be set as a property (previously constructor-only), so R3F users can pin batch size via JSX
- Default materials are now scoped per-world/registry instead of a single process-wide shared cache, fixing cross-scene material/effect leakage; disposed materials resurrect sprites with a fresh default and re-batch automatically
- New `group.batches` / `registry.batches` query surface (`BatchQueryView`) with classification tags (`IsAlphaBlendedBatch`, `IsLitBatch`, `BatchGeometryStrategy`, etc.)

## SortLayerGroup

- New `SortLayerGroup` container that assigns `sortLayer` to first-party children and `renderOrder` to foreign Object3Ds (Skia, Slug, plain Mesh), respecting explicit user overrides and nested groups
- `flatland.declareSortLayer(name, config)` / `flatland.sortLayer(name)` expose layer declarations and numeric render order for placing foreign objects relative to a layer

## Performance

- Synth-quad geometry (index-only, corner synthesized in the vertex shader) frees 3 WebGPU vertex-buffer bindings previously spent on `PlaneGeometry`, doubling effect capacity (`MAX_EFFECT_FLOATS` 12 → 24)

## Fixes

- Assigning a custom material (`sprite.material = ...`) no longer gets silently clobbered by auto-orchestration on the next render sweep
- Synth-quad geometry now carries real `position`/`uv` attributes so user TSL effects calling `uv()`/`positionGeometry()` work correctly again
- Texture swaps no longer mutate a shared default material and retexture sibling sprites in the same batch
- Reassigning a sprite to a new material no longer leaks the old material (and its texture) via a stale `materialRefs` entry
- Swapping `spriteSheet` mid-animation now re-resolves the current frame in the new sheet instead of rendering with stale UVs
- Missing-`alphaMap` raycast warning is now latched per-sprite instead of silencing itself globally after the first offender
- Fixed a stale-slot bug where material-tier upgrades no-opped the batch-slot free during eviction
- `effectTier` values that would exceed WebGPU's buffer limit are now rejected at construction instead of failing deep in pipeline creation
- Various adversarial-review fixes: renderOrder now derives correctly from sortLayer order, chained `Scene.onBeforeRender` re-chains if overwritten, standalone sprites re-evaluate batching thresholds on sortLayer/layers.mask changes, material dispose hooks no longer retain dead worlds, and batch run-key encoding no longer collides at high material IDs

## Refactors

- Extracted shared batch-eviction core (`evictMatchingBatchedEntities`) and batch-view builder (`buildBatchQueryView`) to remove duplication
- Internal auto-orchestration scene sweep no longer calls the deprecated `SpriteGroup.update()`

## BREAKING CHANGES

- `Sprite2D.layer` / the `{ layer }` construction option are renamed to `sortLayer` / `{ sortLayer }` to avoid confusion with three.js's `Object3D.layers` camera bitmask. `Layers` → `SortLayers`, `LayerManager` → `SortLayerManager`. `DEFAULT_BATCH_SIZE` is removed in favor of the batch tier ladder. A codemod is available to migrate existing usage automatically.

---

Adds automatic scene-wide sprite batching and sort-layer orchestration for sprites used outside `SpriteGroup`/`Flatland`, along with a perf-boosting synth-quad geometry change and a `layer` → `sortLayer` rename (codemod provided).

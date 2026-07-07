---
"three-flatland": minor
---

> Branch: feat/sort-layers-orchestration
> PR: https://github.com/thejustinwalsh/three-flatland/pull/141

## Auto-orchestration & batching

- Sprites in a plain three.js scene now self-register per (renderer, scene) and auto-batch with siblings sharing the same material/sortLayer/layers.mask — zero setup required
- Tiered batch buffers (1024 → 4096 → 16384 slots) with hysteresis, so batches grow/shrink without create/destroy flapping around thresholds; bulk-adds size their first batch for the load they already know about
- Default materials are now scoped per world/registry instead of a single cross-world static cache, preventing effect registrations or texture swaps on one scene from leaking into another
- Batch classification traits (`IsAlphaBlendedBatch`, `IsLitBatch`, `BatchGeometryStrategy`) exposed via `group.batches` / `registry.batches` query views
- New `SortLayerGroup` container bridges first-party sprites and foreign three.js objects (Skia, Slug, plain Mesh) under one sort-ordering discipline
- `SpriteGroup.maxBatchSize` is now a settable property (previously constructor-only), so it can be set via R3F JSX

## Fixes

- Assigning `sprite.material` directly no longer gets silently clobbered by auto-orchestration on the next render sweep
- Synth-quad geometry now carries real position/uv attributes, fixing custom TSL effects that read `uv()`/`positionGeometry()` (pixelate, dissolve, outline effects were previously broken)
- Fixed a material leak: reassigning a sprite's material no longer keeps the old material (and its texture) alive forever
- `spriteSheet` swaps now re-resolve the active animation frame instead of rendering with stale UVs
- Missing-alphaMap raycast warning is now latched per sprite instead of a single process-wide flag that suppressed it for every other sprite
- `effectTier` values that exceed the WebGPU buffer cap now throw at construction instead of failing deep in pipeline creation
- Fixed batch eviction reading the wrong (undefined) slot during effect-tier upgrades, which silently no-op'd cleanup
- Auto-batch tier floor raised from 64 to 1024 to cut CPU overhead (~20% faster on the knightmark example at matched sprite counts); batch consolidation across the ladder was dropped in favor of hand-tuned `maxBatchSize` for very large scenes
- Fixed the missing-position console warning firing for synth-quad geometry, and various adversarial-review fixes to the sortLayer/batching stack (renderOrder derivation, dispose listener leaks, run-key bit width, negative sortLayer handling)

## Performance

- Synth-quad geometry (index-only, position synthesized in the vertex shader) replaces `PlaneGeometry` for sprites, freeing 3 vertex-buffer bindings and doubling effect capacity (`MAX_EFFECT_FLOATS` 12 → 24)

## Refactors

- Internal cleanup: shared eviction core, deduped batch-view builder between `SpriteGroup`/`Registry`, internal scene sweep no longer calls the deprecated `SpriteGroup.update()`

## BREAKING CHANGES

- `Sprite2D.layer` renamed to `sortLayer` (and the `{ layer }` constructor option to `{ sortLayer }`), to avoid confusion with three.js's `Object3D.layers` camera bitmask. `Layers`/`LayerManager` renamed to `SortLayers`/`SortLayerManager`. Update any code, examples, or docs referencing the old `layer` property/option.

---

This release activates the full auto-orchestration and auto-batching pipeline for vanilla three.js scenes, adds a `SortLayerGroup` container and per-world default materials, and fixes a series of material/batching correctness bugs surfaced along the way, alongside a sort-layer rename that is the sole breaking change.

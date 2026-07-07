---
"three-flatland": minor
---

> Branch: feat/sort-layers-orchestration
> PR: https://github.com/thejustinwalsh/three-flatland/pull/141

## Auto-orchestration and sort layers

- Sprites in plain three.js scenes (no `SpriteGroup`/`Flatland` wrapper) now auto-register and auto-batch with siblings sharing the same material, sort layer, and camera layer mask — zero setup required.
- Batching is threshold- and hysteresis-driven: a lone sprite stays a standalone `Mesh`; a second sprite promotes both to a batch; batches persist until they're empty (no flapping at the promote/demote boundary).
- Auto-batches grow through a tier ladder (64 → 256 → 1024 → 4096 → 16384 slots) instead of a single fixed size; `maxBatchSize` still pins an explicit size when set.
- New `SortLayerGroup` container: bridges first-party sprites and foreign `Object3D`s (e.g. Skia, Slug meshes) under one sort-order discipline, with nested-group and explicit-assignment precedence rules.
- New `flatland.declareSortLayer(name, config)` / `flatland.sortLayer(name)` APIs for declaring named sort layers and reading their numeric `renderOrder` for placing foreign objects relative to a layer.
- `renderOrder` is now derived from a sprite's declared `sortLayer` order; writing it back is a no-op unless the value differs, at which point the sprite is demoted to standalone and never re-promoted automatically.
- Default (untextured-material-less) sprite materials are now scoped per world/registry instead of shared globally — an effect applied to one `Flatland`'s default material no longer leaks into other `Flatland` instances sharing the same texture.
- Disposing a tracked material now correctly tears down its batches and either resurrects default-material sprites with a fresh material or restores and unenrolls custom-material sprites (matching three's standard "disposed material in use" warning behavior).
- Batches are now queryable and tagged with architectural traits (`IsAlphaBlendedBatch`, `IsLitBatch`, `BatchGeometryStrategy`, etc.) via `group.batches` / `registry.batches`, exposed as an opaque `BatchQueryView`.

## Performance

- Sprites now render from an index-only "synth quad" geometry instead of `PlaneGeometry`, freeing 3 of WebGPU's 8 vertex-buffer bindings — effect buffer capacity doubles (`MAX_EFFECT_FLOATS` 12 → 24) with no API change.
- Fixed a spurious three.js console warning about missing `position` attributes on the new synth-quad geometry (position-less rendering is intentional here; genuinely broken user geometry still warns).
- `computeRunKey` now uses the full 32 bits per component (fixes a collision at 65536 materials) and encodes negative sort layers order-preservingly.

## Fixes

- Fixed the chained `Scene.onBeforeRender` hook losing sprites when a user or framework replaced the render hook after install.
- Fixed sort layer / `layers.mask` changes on standalone auto-registered sprites not triggering re-batching when they converge onto the same run.

## Breaking changes

- `Sprite2D.layer` is renamed to `Sprite2D.sortLayer`; the `{ layer }` constructor option is now `{ sortLayer }`. `Layers`/`LayerManager` are renamed to `SortLayers`/`SortLayerManager`. `sortLayer` accepts either a registered name or a raw number, and a new `SortLayerRegistry` interface supports module augmentation for typed layer names. Update any code, examples, or docs referencing the old `layer`/`Layers`/`LayerManager` names.

Adds automatic cross-scene sprite batching with sort-layer-aware ordering, a `SortLayerGroup` container for mixing first-party and foreign objects, doubled effect-buffer capacity via synth-quad geometry, and per-world default materials — alongside a breaking rename of `layer` to `sortLayer`.

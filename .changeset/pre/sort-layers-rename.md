---
'three-flatland': minor
---

**BREAKING — render-order layers renamed to sort layers.** `layer` → `sortLayer` on `Sprite2D`/`AnimatedSprite2D` (property, constructor option, and R3F JSX prop), `Layers` → `SortLayers`, `LayerManager`/`Layer`/`LayerConfig`/`LayerName`/`LayerValue` → `SortLayerManager`/`SortLayer`/`SortLayerConfig`/`SortLayerName`/`SortLayerValue`, ECS trait `SpriteLayer` → `SortLayer`, and `SpriteSortFunction`'s comparator fields now read `sortLayer`. Camera layer masks (`sprite.layers`, three.js `Layers`) and tilemap tile layers (`TileLayer`, `tileFromIntersection().layer`) intentionally keep their names — that collision is why the rename exists. Also note: assigning `renderOrder` to a sprite now deliberately demotes it from batching to standalone rendering with a custom order; prefer `sortLayer` + `zIndex`.

**A codemod ships with this release.** Point an LLM agent at `node_modules/three-flatland/codemods/layers-to-sort-layers.md` and it migrates your codebase (the artifact embeds the full agent instructions, scope rules for the camera-mask/tile-layer false positives, and verification commands). Codemod index: `node_modules/three-flatland/codemods/README.md`.

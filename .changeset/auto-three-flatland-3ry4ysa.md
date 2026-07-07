---
"three-flatland": minor
---

> Branch: feat-vscode-tools
> PR: https://github.com/thejustinwalsh/three-flatland/pull/117

## Auto-orchestration (drop-in auto-batching)

- Sprites dropped into any three.js scene now self-register and auto-batch with siblings sharing a run key (material, sort layer, camera layer mask) — zero setup required
- Per-`(renderer, scene)` registry with hysteresis (batches created at 2+ sprites, recycled at 0) and a tiered buffer ladder (1024 → 4096 → 16384 slots) sized from bulk-add counts, avoiding warmup-tier overhead for large scenes
- Registry-scoped default materials — registering an effect on one Flatland's default material no longer leaks into other Flatlands sharing a texture
- `SpriteGroup.update()` is deprecated in favor of internal scheduling; batch views (`group.batches` / `registry.batches`) are queryable by tag (`IsAlphaBlendedBatch`, `IsLitBatch`, geometry strategy, etc.)

## Rendering / performance

- New tight-mesh geometry path for alpha-blend sprites: batches render a convex-hull envelope over atlas frame silhouettes instead of a full quad, cutting overdraw on transparent sprites
- Synth-quad geometry (index-only, vertex-synthesized corners) replaces `PlaneGeometry` for standalone and batched sprites, freeing 3 WebGPU vertex-buffer bindings and doubling max effect capacity (`MAX_EFFECT_FLOATS` 12 → 24, 16 for tight-mesh)
- `effectTier` values exceeding the WebGPU buffer cap now throw at construction instead of failing deep in pipeline creation

## Sort layers

- `Sprite2D.layer` renamed to `sortLayer` (see Breaking Changes) with a typed registry (`declareSortLayer` / `getSortLayer` / `resolveSortLayer`)
- New `SortLayerGroup` container bridges first-party sprites and foreign `Object3D`s (Skia, Slug, plain meshes) under a shared render-order contract
- Batch render order now derives from the sort layer's declared numeric order instead of a dense index, restoring the documented foreign-interop contract

## Atlas / TexturePacker

- Full TexturePacker compatibility: rotated frames, trimmed frames, and polygon-trim (tight-mesh) all render correctly without disabling optimizations at export
- Atlas schema relaxed to accept both `meta.image` (legacy/TexturePacker) and `meta.sources` shapes; per-frame `mesh` data (native + TexturePacker polygon-trim) is now part of the atlas format
- Atlas JSON schema/validator moved to a new `@three-flatland/schemas` package — removes the `ajv` dependency and ~35 kB brotli from the `three-flatland` runtime bundle; generated types keep `tools/io` and `three-flatland` in sync

## Remote debugging

- New WebSocket transport (`connectRemoteDevtools`, `createDevtoolsProvider({ remote })`) lets the dashboard attach to a game running on a separate device
- Time-travel scrubber (Phase A): park the dashboard at a past engine frame and every panel (stats, protocol log, buffers) snaps to that moment

## Fixes

- Corrected several batching/material bugs: stale material refs kept alive after reassignment, batches reusing stale tight-mesh geometry after atlas updates, incorrect anchor/trim baking in the batched transform path, and default materials being mutated in place on texture swap
- `AnimatedSprite2D` now re-resolves its current frame when swapping sprite sheets, and the missing-alphaMap raycast warning is latched per sprite instead of process-wide
- `SpriteSheetLoader` tolerates legacy `meta.image`-only atlases

## BREAKING CHANGES

- `Sprite2D.layer` / `{ layer }` constructor option renamed to `sortLayer` / `{ sortLayer }`. `LayerManager` renamed to `SortLayerManager` (`Layer` → `SortLayer`). `DEFAULT_BATCH_SIZE` removed in favor of the auto-batch tier ladder.

Auto-batching now works out of the box for any three.js scene, the atlas/schema stack is faster and TexturePacker-complete, and remote WebSocket debugging with time-travel scrubbing lands for the devtools dashboard.

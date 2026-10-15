---
"three-flatland": minor
---

> Branch: feat/overdraw-tight-mesh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/142

## Tight-mesh envelope geometry for alpha-blend sprites

- Add tight-mesh (convex-hull envelope) geometry path for transparent, non-alpha-tested sprite materials, cutting overdraw/fringe shading vs the synth-quad path. Materials auto-select the strategy from registered atlas polygon data; unregistered/meshless textures keep rendering as the synth quad with no behavior change.
- Extend the atlas format with optional per-frame polygon mesh data (native `mesh` field or TexturePacker polygon-trim import), concatenated per-sheet and registered against each texture via a new atlas mesh registry.
- Rebuild affected batches automatically when atlas content changes after sprites are already batched (late-loading sheets, re-registration, merges, degrades) — envelopes and geometry versioning now track atlas state so stale/clipped geometry can't persist.
- Rotated TexturePacker frames fall back to the quad (rotated sampling isn't supported yet) instead of producing incorrectly sampled meshes.
- Disconnected sprite silhouettes (multiple alpha blobs) now trace every connected component instead of only the first, preventing clipped envelopes.
- A material already over the tight-mesh effect-float budget (16 floats, vs 24 for synth-quad) now demotes to synth-quad with a warning instead of throwing or silently overflowing WebGPU's binding budget; `registerEffect` is transactional so a rejected effect never leaves partial state behind.
- Fix atlas merge bugs: a meshless sheet loading before a meshed sheet sharing its texture no longer gets marked complete prematurely (which would clip its frames); two complete sheets merging now correctly stay complete; dangling registry-level mesh arrays from re-registration are removed since only per-frame data is used.

Files: packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/loaders/atlasMeshRegistry.ts, packages/three-flatland/src/loaders/atlasMesh.test.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts, packages/three-flatland/src/pipeline/convexHull.ts, packages/three-flatland/src/pipeline/envelopeGeometry.ts, packages/three-flatland/src/pipeline/tightMesh.test.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/sprites/types.ts, packages/atlas/src/polygon.ts

Summary: Adds an opt-in tight-mesh envelope geometry path that reduces alpha-blend overdraw for sprites with registered atlas polygon data, plus a series of correctness fixes for atlas merging, late registration, and effect-budget handling discovered during review.


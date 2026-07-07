---
"three-flatland": minor
---

> Branch: feat/overdraw-tight-mesh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/142

## New geometry option for alpha-blend sprites

- Added a tight-mesh render path for transparent sprites: batches sharing an atlas now render through a per-atlas convex-hull envelope instead of a full quad, cutting overdraw/fringe shading for alpha-blended sprite batches.
- Sprite2DMaterial automatically selects tight-mesh vs the existing synth-quad geometry based on texture transparency, alphaTest, and whether the atlas has registered polygon data — no API changes required to opt in.
- Atlas/SpriteSheet format extended with optional per-frame polygon mesh data (native format and TexturePacker polygon-trim import), fully backwards compatible; frames without mesh data keep rendering as quads.
- Standalone `Sprite2D` geometry now carries real position/uv attributes usable by both the quad and tight-mesh shader paths.
- `OcclusionPass` mirrors the tight-mesh/synth-quad strategy of its source material so occluders render with matching geometry.

## Fixes

- Fixed stale/clipped geometry: batches now rebuild when an atlas's registered mesh data changes (new sheet merged in, or a mesh degraded to quad), instead of keeping a stale baked envelope.
- Fixed the batch pool reusing a pooled `SpriteBatch` with an outdated envelope even after a version bump — pool lookup now checks the atlas version the batch's geometry was built from.
- Fixed disconnected alpha shapes: polygon tracing now covers every connected component instead of only the first, so multi-blob sprites no longer get clipped by an incomplete hull.
- Fixed winding mismatch between the opaque fast path and the earclip path so both produce correct front-facing triangles after the baker's y-flip.
- Materials with more than 16 effect floats now correctly fall back to synth-quad instead of exceeding WebGPU's binding budget.
- Re-registering an atlas mesh (two sheets sharing a texture) now merges conservatively and no longer leaves dangling vertex/index offsets; `complete` only stays `true` when all merged entries are complete.
- Late atlas registration (loader finishes after sprites are already batched) now correctly re-resolves geometry strategy and re-batches instead of leaving mismatched geometry.
- Rotated TexturePacker frames now fall back to the quad instead of sampling incorrect texels, since rotated source meshes don't match unrotated frame UVs yet.

Adds an opt-in tight-mesh geometry path that reduces overdraw for alpha-blended sprite batches, along with a batch of correctness fixes for atlas mesh registration, batch caching, and polygon tracing found during review.

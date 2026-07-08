---
"three-flatland": minor
---

> Branch: feat/rotated-polygon-mesh
> PR: https://github.com/thejustinwalsh/three-flatland/pull/144

- Polygon-trim meshes (`SpriteSheetLoader`) are no longer discarded for rotated TexturePacker frames. Previously any frame with `frame.rotated: true` fell back to a plain quad, even when a mesh was defined; now the mesh renders correctly since mesh space is always the unrotated source frame, and rotation is handled per-instance in the shader (`ROTATED_FRAME_MASK` unrotation in `Sprite2DMaterial`/`OcclusionPass`).
- Rotated polygon frames now contribute their hull to `buildEnvelopeGeometry` instead of degrading to a 4-corner quad fallback, improving overdraw reduction and occlusion accuracy for rotated, tightly-trimmed sprites.
- Docs: corrected the hit-test guide's rotated/trimmed-frame caveat — rendering now honors both `frame.rotated` and `frame.trimmed`, but alpha hit-testing (`AlphaMap.sampleFrame`) hasn't caught up yet and can sample the wrong atlas region for such frames. Recommends `hitTestMode: 'bounds'` as a workaround until full atlas-aware alpha sampling lands (PR #117). Also updated the loaders guide to note polygon-trim now supports rotated frames.

Fixes polygon-mesh sprites packed with rotation enabled in TexturePacker so they render with tight, overdraw-reducing meshes instead of silently falling back to quads.

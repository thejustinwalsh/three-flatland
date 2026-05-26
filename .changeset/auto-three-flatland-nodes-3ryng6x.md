---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/nodes

New TSL lighting nodes and shadow tracing helpers for the 2D lighting pipeline.

### New — `shadowSDF2D` sphere-trace shadow node
- `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, opts)` — sphere-traces a ray through the SDF and returns a `[0, 1]` shadow value with Inigo-Quilez-style soft penumbra
- Tunable `steps` (default 32), `softness`, `startOffset`, and `eps` options; accepts uniform nodes
- Ships alongside existing `shadow2D`/`shadowSoft2D` alpha-raymarch helpers

### Shadow system improvements
- Signed SDF via dual JFA chains: `SDFGenerator` now runs JFA twice (outside + inside distance) and combines them; fragments inside occluders see negative values, enabling cleaner self-shadow detection (`sdf < 0`) without magic escape offsets
- `shadowStartOffset` replaces the hardcoded 40-unit `escapeOffset`; `DefaultLightEffect` exposes it as a tunable schema uniform (default 1.5 world units)
- `shadowBias` and `shadowStartOffset` now have separate semantics (hit epsilon vs. self-shadow escape)
- `shadowFilter` option (`auto|nearest|linear`) for SDF sample filter: auto picks nearest for pixel-snap mode, linear otherwise
- Off-screen lights no longer cast false edge shadows — `worldToSDFUV` no longer clamps sample UVs; out-of-field samples advance by the eps floor and are treated as unoccluded
- SDF regeneration now triggers on `OrthographicCamera.zoom` changes (frozen shadows on zoom fixed)
- `shadowSDF2D` docstring corrected to reflect the selectable filter

### New lighting nodes
- `lit`, `normalFromHeight`, `normalFromSprite`, `lights`, `shadows` — TSL nodes for the 2D lighting model
- `LightEffect` system with traits, registry, and React attach helpers
- 2D lighting pipeline: JFA-based SDF generation, Forward+ tiled culling with SDF occlusion, `Light2D` class (point, directional, ambient, spot types)

### Refactoring
- Removed unused `TileNormalProvider`, `AutoNormalProvider` references from lighting index
- `shadowBands`/`shadowBandCurve` uniforms removed (superseded by signed-SDF post-quantization path)

This release ships the complete `shadowSDF2D` sphere-trace pipeline with signed-SDF, per-sprite shadow radii, and a corrected occluder-dirty gate that handles camera zoom.

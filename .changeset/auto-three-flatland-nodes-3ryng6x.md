---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changelog

### Shadow shader nodes

- New `shadowSDF2D` TSL helper: sphere-traces a signed SDF texture from a surface fragment toward a light, returning a `[0, 1]` shadow value with IQ-style running-min penumbra for soft edges
- Options: `steps`, `softness`, `startOffset`, `eps` — all can be compile-time constants or uniform nodes
- Ships alongside existing `shadow2D` / `shadowSoft2D` raymarch helpers (different algorithm, both supported)

### Signed SDF

- `SDFGenerator` now packs both JFA seed UVs (nearest-occluder + nearest-empty) into a single RGBA ping-pong chain, cutting texture reads versus the earlier dual-chain approach
- Signed distance field: fragments outside occluders see positive distance, fragments inside see negative — eliminates the hardcoded `escapeOffset = 40` calibration
- Self-shadow detection changed from `sdf < eps` to `sdf < 0` (strictly inside), removing the approximation error

### Shadow controls

- `shadowStartOffset` uniform: replaces the hardcoded 40-unit escape offset; default 1.5 world units (safe with signed SDF), tunable per scene
- `shadowFilter` option (`auto | nearest | linear`): `auto` picks nearest when `shadowPixelSnapEnabled`, linear otherwise
- Fixed `shadowBias` semantics: stays as IQ hit epsilon; `shadowStartOffset` now exclusively handles self-shadow escape — neither masks the other
- Corrected `shadowSDF2D` docstring: filter mode is selectable via `shadowFilter`, not always nearest

### Bug fixes

- SDF no longer freezes on `OrthographicCamera.zoom` changes: `shadowPipelineSystem` now tracks `lastZoom` in the occluder-dirty gate
- Off-screen lights no longer cast false edge shadows: `worldToSDFUV` no longer clamps sample UVs; out-of-field samples advance by `eps` floor (treated as unoccluded)
- Raised `shadowStartOffset` default to 40 temporarily to match knight-scale casters, then superseded by per-sprite `shadowRadius`

`@three-flatland/nodes` delivers a complete signed-SDF shadow pipeline with tunable soft edges, per-sprite escape offsets, and correct behavior for off-screen lights and camera zoom.

---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/nodes

### New features

- `shadowSDF2D(surfacePos, lightPos, sdfTexture, worldSize, worldOffset, opts)` — TSL sphere-trace helper producing a [0,1] shadow value with Inigo-Quilez-style penumbra for soft edges; configurable `steps`, `softness`, `startOffset`, `eps`
- `shadowFilter` option on SDF sampling: `'auto'` (nearest when pixel-snap enabled, linear otherwise), `'nearest'`, or `'linear'` — reduces halo artifacts with the blur pass
- `shadowStartOffset` uniform replaces the hardcoded `escapeOffset = 40` — tunable world-unit self-shadow escape, default 1.5 (safe with signed SDF)
- Signed SDF via dual JFA chains: SDFGenerator runs two JFA passes (outside + inside distance) and combines into a signed field; `sdf < 0` cleanly detects ray-inside-caster without guessing at sprite scale
- `normalFromSprite` and lighting shader nodes exported from `@three-flatland/nodes/lighting`

### Bug fixes

- SDF regenerates on `OrthographicCamera.zoom` change — previously zoom scaled occluder silhouettes while the dirty gate skipped regen, freezing shadows
- Off-screen lights no longer cast false edge shadows — `worldToSDFUV` no longer clamps sample UVs; out-of-field samples advance by the `eps` floor (treated as unoccluded)
- Penumbra math corrected
- Corrected `shadowSDF2D` docstring: SDF sample filter is selectable via `shadowFilter`, not always nearest

### Removed

- `RadianceCascades`, `DirectLightEffect`, `SimpleLightEffect`, `AutoNormalProvider` moved out to a follow-up PR — only `DefaultLightEffect` + `NormalMapProvider` ship in this release

Delivers a complete SDF-based 2D shadow system with tunable soft edges, signed distance fields, and per-light shadow control.

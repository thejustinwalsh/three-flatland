---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### New TSL helpers

- `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, opts)` — sphere-trace soft shadow through a JFA SDF texture; returns `[0, 1]` shadow factor with IQ-style running-min penumbra for soft edges
- `normalFromSprite` TSL node — computes tangent-space normals from sprite alpha at runtime (4-neighbor gradient)
- `normalFromHeight` TSL node — tangent-space normals from a heightmap channel
- Full lighting shader module: `lit`, `lights`, `shadows`, and `normalFromSprite`/`normalFromHeight` exported from `@three-flatland/nodes/lighting`

### Shadow fixes

- `worldToSDFUV` no longer clamps sample UVs to `[0,1]`; out-of-field samples advance by the epsilon floor (treated as unoccluded) — fixes off-screen lights casting false edge shadows
- `shadowSDF2D` self-shadow detection uses `sdf < 0` (signed field) instead of `sdf < eps`, eliminating the eps approximation
- `shadowStartOffset` raised to 40 as the correct default for typical sprite scales; fully tunable via uniform
- Penumbra math corrected

### Signed SDF consumption

- `shadowSDF2D` takes advantage of the signed SDF produced by `SDFGenerator`: fragments inside casters see negative distance, improving both self-shadow detection and grazing-hit accuracy

Delivers the core `shadowSDF2D` TSL primitive and the full lighting shader module consumed by `@three-flatland/presets`.

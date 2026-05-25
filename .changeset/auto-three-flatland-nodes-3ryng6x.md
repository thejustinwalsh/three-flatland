---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/nodes

### New features

- **2D lighting TSL helpers**: `lit`, `lights`, `normalFromHeight`, `normalFromSprite` — TSL node helpers for the 2D lighting pipeline
- **`shadowSDF2D`**: sphere-trace soft shadow helper that walks a line from fragment to light through an SDF texture; produces `[0, 1]` shadow value with Inigo-Quilez running-min penumbra for soft edges; configurable `steps`, `softness`, `startOffset`, `eps`
- **Signed SDF consumption**: self-shadow detection now uses `sdf < 0` (strictly inside) replacing the eps approximation; signed field produced by SDFGenerator's packed dual-JFA chain
- **Tunable `shadowStartOffset`**: replaces the hardcoded `escapeOffset = 40` magic; exposed as `startOffset: FloatInput` option in `shadowSDF2D`
- **`shadowFilter` option**: `auto | nearest | linear` for SDF shadow sampling — auto selects nearest when `shadowPixelSnapEnabled`, linear otherwise

### Bug fixes

- Off-screen lights no longer cast false edge shadows: `worldToSDFUV` no longer clamps sample UVs to `[0, 1]`; out-of-field samples advance by the eps floor (treated as unoccluded)
- SDF is now regenerated on `OrthographicCamera.zoom` changes — previously zoom scaled occluder silhouettes without triggering regen, freezing shadows
- `shadowStartOffset` default raised to 40 to match typical caster scale (knight body ~64 world units); self-shadow artifacts and edge ringing at 1.5 default are fixed
- Fixed penumbra math in the sphere-trace loop

This release ships the full suite of 2D lighting TSL node helpers including the `shadowSDF2D` sphere-trace shadow function and correctness fixes for off-screen lights, camera zoom, and self-shadow detection.

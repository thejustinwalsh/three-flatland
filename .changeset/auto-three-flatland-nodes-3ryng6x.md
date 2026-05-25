---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Shadow-trace TSL helpers and SDF correctness fixes for the lighting-stochastic-adoption branch.**

### New API

- `shadowSDF2D()` — sphere-trace soft shadow through an SDF texture; produces `[0, 1]` shadow value with an IQ-style running-min penumbra term
- `shadowStartOffset` tunable `FloatInput` option on `shadowSDF2D` (replaces hardcoded 40-unit constant); `shadowBias` and `shadowStartOffset` semantics split (bias = hit epsilon, offset = self-shadow escape)

### Bug fixes

- Off-screen lights no longer cast false edge shadows: `worldToSDFUV` no longer clamps sample UVs to `[0, 1]`; out-of-field samples advance by the eps floor and are treated as unoccluded
- Penumbra math corrected
- Signed SDF consumed by `shadowSDF2D`: `sdf < 0` detects self-shadow directly (replaces the `sdf < eps` unsigned approximation)
- `shadowStartOffset` default raised back to 40 after the signed-SDF self-shadow gate made the smaller default artifact-prone with large casters

Delivers the complete `shadowSDF2D` sphere-trace helper and fixes off-screen light false-shadow and penumbra bugs.

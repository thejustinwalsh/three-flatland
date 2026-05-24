---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New TSL Helpers

- `shadowSDF2D`: sphere-trace soft shadow through an SDF texture; produces a `[0, 1]` shadow value with an Inigo-Quilez-style running-min penumbra term; configurable step count and start offset
- Signed SDF support: `SDFGenerator` runs JFA twice (occluder seeds + empty-space seeds), combining inside and outside distances in the final pass; repacked into a single RGBA ping-pong chain at the same VRAM and sample cost as the previous unsigned generator
- Debug protocol buffer subscription and effect field location helpers

## Changes

- `shadowStartOffset` exposed as a tunable `FloatInput` option; hardcoded 40-unit escape distance removed
- `shadowStartOffset` default corrected to `40` world units (previous `1.5` default caused self-shadowing on sprites larger than ~1.5 world units)

## Fixes

- Shadows moved to post-process pipeline; JFA seed / propagation pass bugs corrected
- Penumbra math corrected for IQ running-minimum formulation

The package adds the `shadowSDF2D` TSL node that sphere-traces soft shadows through the signed SDF produced by the Forward+ lighting pipeline.

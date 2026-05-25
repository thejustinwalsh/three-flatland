---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New Features

- `shadowSDF2D` TSL node: sphere-traces soft shadows through an SDF texture; IQ-style running-min penumbra term produces soft shadow edges; configurable `steps`, `softness`, `startOffset`, `eps`
- `shadowFilter` option (`auto|nearest|linear`): `auto` picks nearest for pixel-art snap (`shadowPixelSnapEnabled`), linear for smooth edges
- Signed SDF in `shadowSDF2D`: uses `sdf < 0` for at-caster self-shadow detection, eliminating the eps approximation needed for unsigned SDFs
- Tunable `shadowStartOffset` option replaces the hardcoded 40-unit escape offset; `shadowBias` and `shadowStartOffset` serve distinct roles (hit epsilon vs. self-shadow escape)
- `normalFromSprite` TSL helper: per-fragment tangent-space normal computed from alpha 4-neighbor gradient
- `LightEffect` system with traits, registry, and R3F attach helpers for wiring lights into the ECS pipeline
- Initial 2D lighting pipeline: JFA-based SDF generation, Forward+ tiled culling, Radiance Cascades (WIP)

## Bug Fixes

- Fixed shadow regen skipped when `OrthographicCamera.zoom` changed without affecting frustum bounds or position
- Fixed off-screen lights casting false shadow edges — `worldToSDFUV` no longer clamps sample UVs; out-of-field samples advance by the eps floor and are treated as unoccluded
- Fixed `shadowStartOffset` default raised to 40 to match demo caster scale (knight body is 64 world units at 1.5 default the trace self-shadowed)
- Fixed penumbra math
- Fixed shadow pipeline running before transform sync, causing one-frame shadow lag on moving casters

## Removals

- Removed `AutoNormalProvider`, `TileNormalProvider`, `DirectLightEffect`, `SimpleLightEffect`, and `RadianceLightEffect` stubs (cleaned up unimplemented providers)

The nodes package ships the full shadow/SDF TSL helper suite and the 2D lighting node primitives for the `three-flatland` pipeline.

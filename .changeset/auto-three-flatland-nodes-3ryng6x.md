---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Shadow Tracing

- `shadowSDF2D` TSL helper: sphere-traces from a fragment toward a light through an SDF texture, returning a `[0, 1]` shadow value with Inigo-Quilez-style running-min penumbra for soft edges
- `shadowStartOffset` tunable uniform (default `1.5`) replaces a hardcoded 40-unit escape constant; signed SDF makes the smaller default safe since `sdf < 0` detects "ray started inside a caster" without guessing at sprite scale
- Distinct `shadowBias` (IQ hit epsilon) and `shadowStartOffset` (self-shadow escape) — neither masks the other

## Signed SDF

- `SDFGenerator` runs two JFA chains: one seeded on occluder texels (outside distance) and one on empty texels (inside distance); final pass combines as `signedDist = distOutside - distInside`
- Fragments inside a caster see negative distance; self-shadow detection uses `sdf < 0` instead of an epsilon approximation
- JFA packed into a single ping-pong chain (one set of ping/pong textures shared for both chains) after the initial dual-chain implementation
- Debug buffer names updated: `sdf.jfaPing/PongOutside` and `sdf.jfaPing/PongInside`

## Lighting System

- `shadowSDF2D` consumed in `DefaultLightEffect` / `DirectLightEffect` via build context (SDF texture + world bounds threaded through)
- `LightEffect` system with trait registry and attach helpers for React integration
- `lit`, `normalFromSprite`, `normalFromHeight`, `shadows` node modules establishing the core lighting node graph

## Cleanup

- Unused lighting providers (`AutoNormalProvider`, `TileNormalProvider`, `DirectLightEffect`) and stale loaders removed
- `normalFromSprite` updated for new interleaved attribute layout

Adds `shadowSDF2D` soft-shadow tracing and signed SDF generation as production-ready TSL nodes, replacing the earlier stub `shadow = float(1.0)` in the presets lighting effects.

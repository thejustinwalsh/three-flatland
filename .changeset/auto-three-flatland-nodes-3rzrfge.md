---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `shadowSDF2D` TSL helper in `@three-flatland/nodes/lighting`: sphere-traces a line from the shaded fragment toward a light through a signed SDF texture, returning a `[0, 1]` shadow value with IQ-style penumbra for soft edges
  - Signature: `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, { steps?, softness?, startOffset?, eps? })`
  - `startOffset` option replaces hardcoded escape offset; exposed as `shadowStartOffset` uniform in `DefaultLightEffect` (default 40 world units to clear typical caster radii)
- `shadowSDF2D` updated to consume signed SDF: at-surface self-shadow detection uses `sdf < 0` (strictly inside) instead of `sdf < eps`, eliminating the unsigned-SDF approximation
- `shadowBias` semantics clarified: hits epsilon only; `shadowStartOffset` handles self-shadow escape independently — neither can mask the other
- `normalFromSprite` TSL node updated with elevation-aware output
- 2D lighting shader nodes added: `lit`, `lights`, `normalFromHeight`, `normalFromSprite`, `shadows`

`@three-flatland/nodes` now ships a complete TSL shadow-tracing primitive ready for consumption by `DefaultLightEffect` and `DirectLightEffect`.

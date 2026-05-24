---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting TSL nodes** — new lighting sub-module in `@three-flatland/nodes/lighting`.

**shadowSDF2D**
- Sphere-trace soft shadow through an SDF texture; returns a `[0, 1]` shadow factor with Inigo-Quilez-style running-min penumbra
- Signature: `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, { steps?, softness?, startOffset?, eps? })`
- `startOffset` skips self-shadow artifacts on the caster sprite; now tunable via a `FloatInput` uniform (previously hardcoded to 40 world units)
- Signed SDF support: self-shadow detection uses `sdf < 0` (strictly inside) instead of an epsilon approximation
- Penumbra math fix applied

**normalFromSprite / normalFromHeight**
- TSL helpers for runtime per-sprite normal generation from alpha-gradient and heightmap inputs

**lights / lit**
- `Light2D` data accessors and lit-surface TSL nodes for forward+ shading

**LightEffect system**
- Traits, registry, and React attach helpers for wiring light effects into the R3F scene graph

**Bug fixes**
- `shadowStartOffset` default raised to 40 (from 1.5) to clear typical caster radii out-of-the-box; still user-tunable via slider

This release ships the core TSL lighting node library that `@three-flatland/presets` builds its `DefaultLightEffect` on.

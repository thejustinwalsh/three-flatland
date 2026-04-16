---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New `@three-flatland/nodes/lighting` TSL shader node module:**
- `lit`: per-fragment diffuse + specular with distance-based light attenuation
- `shadow2D` / `shadowSoft2D`: alpha-raymarched 2D occlusion helpers
- `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, opts?)`: sphere-traced soft shadows through a JFA SDF texture; Inigo-Quilez penumbra term; configurable `steps` (default 32, compile-time unrolled), `softness`, `startOffset`, `eps`
- `normalFromSprite` / `normalFromHeight`: tangent-space normal generation from alpha gradient or height map
- `lights`: light packing/unpacking helpers for the Forward+ LightStore texture

**LightEffect system:**
- `LightEffect` base class and registry for custom lighting effects
- `LightEffectBuildContext` carries `lightStore`, `sdfTexture`, `worldSizeNode`, `worldOffsetNode` for shader build time
- React `attach` helpers for wiring `LightEffect` and `Light2D` as R3F JSX children

Introduces `@three-flatland/nodes/lighting`, a set of TSL shader helpers for the 2D lighting pipeline including SDF sphere-traced soft shadows, normal generation, and Forward+ light store access.

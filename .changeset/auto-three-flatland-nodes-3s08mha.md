---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New TSL lighting shader nodes**

- `normalFromSprite` — computes tangent-space normals from sprite alpha gradient (4-neighbor sample)
- `normalFromHeight` — derives normals from a height map
- `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, opts?)` — sphere-trace soft shadow through an SDF texture; returns `[0, 1]` shadow factor with Inigo-Quilez penumbra; configurable `steps`, `softness`, `startOffset`, `eps`
- `lit` node for compositing diffuse lighting with normals, shadows, and light contributions
- `lights` node utilities for per-light evaluation

**Updates**

- Lighting example (`examples/react/lighting`) rebuilt against current API with Tweakpane controls
- `shadows.ts` startOffset and softness defaults tuned for the new SDF pipeline

All new nodes ship in `@three-flatland/nodes/lighting` alongside existing `shadow2D`/`shadowSoft2D` helpers.

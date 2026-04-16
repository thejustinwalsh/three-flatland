---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Lighting shader nodes** (`@three-flatland/nodes/lighting`):
- `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, opts)`: sphere-traced soft shadow through an SDF texture; returns a `[0, 1]` float node with Inigo-Quilez running-min penumbra
  - Options: `steps` (default 32), `softness`, `startOffset` (self-shadow bias), `eps` — accept compile-time constants or uniform nodes
- `lit`, `normalFromSprite`, `normalFromHeight`, `lights`, `shadows` — full TSL lighting node set exported from `@three-flatland/nodes/lighting`

Minor fix: `shadowSDF2D` loop uses `Loop`/`Break` with compile-time unroll for small step counts; penumbra clamped to `[0, 1]`, higher `softness` = sharper.

`@three-flatland/nodes` adds the `shadowSDF2D` SDF sphere-trace helper and completes the TSL lighting node library powering the 2D shadow pipeline.

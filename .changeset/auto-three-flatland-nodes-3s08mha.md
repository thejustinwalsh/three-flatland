---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New TSL lighting nodes:**
- `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, opts)`: sphere-trace soft shadow helper; walks toward the light sampling an SDF texture, returns `[0,1]` shadow value with IQ-style running-min penumbra; configurable `steps` (default 32), `softness`, `startOffset`, `eps`
- Initial lighting TSL node modules: `lit`, `shadows` (`shadow2D`/`shadowSoft2D`/`shadowSDF2D`), `normalFromSprite`, `normalFromHeight`, `lights` — foundational shader helpers for the 2D lighting pipeline

`@three-flatland/nodes` ships the full set of TSL lighting shader helpers including `shadowSDF2D` for SDF-based soft shadows alongside the existing alpha-raymarching shadow helpers.

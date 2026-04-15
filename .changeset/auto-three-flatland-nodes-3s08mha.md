---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Lighting shader nodes**

- Added `shadowSDF2D` TSL helper: sphere-traces a line from surface toward light through an SDF texture, returning a `[0,1]` shadow value with Inigo-Quilez-style penumbra for soft edges
  - Signature: `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, { steps?, softness?, startOffset?, eps? })`
  - Default 32 steps, compile-time unrolled for small step counts
- Added `normalFromSprite` and `normalFromHeight` TSL nodes for computing tangent-space normals from sprite alpha and heightmap inputs
- Added `lights.ts` with TSL lighting computation helpers
- Added `lit.ts` TSL node for combining light contributions

**Post-rebase fixes**

- `shadows.ts` lint cleanup: unused import removal

These nodes underpin the `@three-flatland/presets` lighting effects and are available for use in custom `LightEffect` implementations.

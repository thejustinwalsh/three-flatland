---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Lighting shader nodes**

- `normalFromSprite(alphaTexture)`: derives tangent-space normals from sprite alpha via 4-neighbor gradient
- `normalFromHeight(heightTexture)`: normal from a greyscale height map
- `lit(...)`: combines diffuse + specular contributions with light store and normal input
- `lights(lightStore, ...)`: iterates light store entries for the lighting accumulation loop

**shadowSDF2D**
- New `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, opts)` TSL helper
- Sphere-traces a line from fragment toward the light, sampling an SDF texture to advance by guaranteed-clear distances
- IQ-style running-min penumbra term for soft shadow edges; returns `float` in `[0, 1]` (0 = fully shadowed)
- Options: `steps` (default 32), `softness` (8 = soft, 32 = sharp), `startOffset` (self-shadow bias), `eps`
- SDF texture assumed to come from `SDFGenerator` (distance on `.r` channel in UV space)
- All exported from `@three-flatland/nodes/lighting`

**Post-rebase updates**
- `shadows.ts` updated to align with `shadowSDF2D` integration in `DefaultLightEffect` and `DirectLightEffect`

`@three-flatland/nodes` now exports a complete set of TSL lighting helpers covering normals, illumination, and SDF-based soft shadows for the Flatland 2D lighting pipeline.

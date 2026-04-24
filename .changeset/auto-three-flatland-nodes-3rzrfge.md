---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### TSL lighting nodes

- New `shadowSDF2D` TSL node: sphere-traces a signed distance field toward a light, producing a `[0, 1]` shadow value with Inigo-Quilez soft-edge penumbra
  - Configurable `steps` (default 32), `softness`, `startOffset`, `eps`
  - Ships alongside existing `shadow2D` / `shadowSoft2D` alpha-raymarch helpers
- New `normalFromSprite`, `normalFromHeight` TSL nodes for computing tangent-space normals from sprite alpha and heightmaps
- New `lit` TSL node for accumulating diffuse + ambient contributions per-light

### Shadow pipeline improvements

- Signed SDF via packed RGBA JFA ping-pong: `R,G` = nearest-occluder seed UV, `B,A` = nearest-empty-space seed UV; one JFA chain instead of two — same VRAM and sample cost as the original unsigned generator
- Self-shadow detection uses `sdf < 0` (strictly inside caster) instead of `sdf < eps` approximation, eliminating the guess-the-sprite-scale offset
- Tunable `shadowStartOffset` uniform in `shadowSDF2D`; splits the previously-overloaded `shadowBias` (now IQ hit epsilon only)
- `shadowStartOffset` default raised to 40 world units to safely clear typical 64-unit casters out of the box

### Lighting index

- Removed unused re-exports; cleaned up `@three-flatland/nodes/lighting` public API

The `shadowSDF2D` node replaces the `shadow = float(1.0)` stub in `DefaultLightEffect` and `DirectLightEffect`, delivering real SDF-based soft shadows.

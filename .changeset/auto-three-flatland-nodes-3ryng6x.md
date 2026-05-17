---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `shadowSDF2D` TSL helper — sphere-traces a line from fragment to light through an SDF texture, returns a `[0, 1]` shadow factor with Inigo-Quilez-style penumbra for soft edges
- `shadowSDF2D` options: `steps` (default 32), `softness` (higher = sharper), `startOffset` (self-shadow escape), `eps` (hit threshold)
- Signed SDF support in `shadowSDF2D` — uses `sdf < 0` for inside-caster detection; eliminates the previous epsilon-approximation for the unsigned case
- `shadowStartOffset` uniform promoted to a tunable parameter on `shadowSDF2D`; `shadowBias` now exclusively the IQ hit epsilon — the two semantics no longer overlap
- `shadowStartOffset` default raised to 40 world units to match typical sprite caster scale (64u knight, 32u slime); remains user-tunable per scene
- Removed `shadowBands` / `shadowBandCurve` shader uniforms — superseded by post-quantization shadow in `DefaultLightEffect`
- `normalFromSprite` TSL node updated for elevation support
- Unused lighting providers and exports pruned from `@three-flatland/nodes/lighting` barrel
- `2D lighting pipeline` (initial): JFA-based SDF generator, Forward+ tiled culling, `lit` / `lights` / `normalFromHeight` / `normalFromSprite` TSL helpers

`@three-flatland/nodes` delivers production-quality SDF shadow tracing via `shadowSDF2D`, with soft penumbra and correct signed-SDF self-shadow handling.

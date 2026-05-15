---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting TSL nodes (new package)**
- `shadowSDF2D(surfacePos, lightPos, sdfTexture, worldSize, worldOffset, opts)` — sphere-traces a signed SDF texture to produce a `[0,1]` shadow value; Inigo-Quilez running-min penumbra for soft edges; 32-tap default, compile-time unrolled for small counts
- `lit()`, `normalFromHeight()`, `normalFromSprite()` — diffuse lighting, height-map normal derivation, and per-fragment alpha-gradient normal generation helpers
- `lights.ts` — TSL helpers for sampling the Forward+ `LightStore` DataTexture (point, directional, ambient, spot)

**shadowSDF2D improvements**
- Tunable `shadowStartOffset` uniform (replaces hardcoded `escapeOffset = 40`); splits semantics from `shadowBias` — bias is the IQ hit epsilon, startOffset handles self-shadow escape
- Default raised back to 40 after signed-SDF landed (cleaner `sdf < 0` self-shadow detection eliminates the need for conservative guessing, but large-sprite demos still need clearance)
- Penumbra math corrected

**Signed SDF consumption**
- `shadowSDF2D` uses `sdf < 0` for at-surface self-shadow detection (exact, no epsilon approximation) and catches all grazing hits in the same `< eps` loop check

2D lighting TSL node library covering shadows, normals, and light sampling for the Flatland lighting pipeline.

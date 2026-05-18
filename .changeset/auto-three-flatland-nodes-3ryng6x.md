---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changes

**New TSL helpers**
- `shadowSDF2D(surfaceWorldPos, lightWorldPos, sdfTexture, worldSize, worldOffset, opts)` — sphere-trace soft shadow through an SDF texture; returns `[0, 1]` shadow value with Inigo-Quilez running-min penumbra; configurable `steps` (default 32), `softness`, `startOffset`, `eps`
- `normalFromSprite` updated to support elevation-aware occlusion

**Shadow system**
- `shadowSDF2D` wired into the lighting pipeline via build-context `sdfTexture` / `worldSizeNode` / `worldOffsetNode`; replaces the previous `shadow = float(1.0)` stub
- Tunable `shadowStartOffset` uniform: replaces the hardcoded `escapeOffset = 40`; `DefaultLightEffect` exposes it as a schema uniform (default 1.5 world units, raised to 40 as the demo default)
- Penumbra math corrected for accurate soft-shadow edges
- Shadow pipeline moved to post-process pass; SDF generation bugs fixed

**Signed SDF**
- `SDFGenerator` upgraded from unsigned to signed distance field: two JFA chains seeded on occluder vs. empty texels, combined as `distOutside − distInside`; later optimised to a single packed RGBA chain at the same VRAM cost as the original unsigned generator
- Signed SDF enables `sdf < 0` self-shadow detection, eliminating the `escapeOffset` approximation

**Bug fixes**
- Raised `shadowStartOffset` default to 40 to match demo knight scale (64 world units); 1.5 caused self-shadow artifacts on the hero sprite
- Penumbra term corrected

Adds `shadowSDF2D` for GPU sphere-trace soft shadows and upgrades the SDF generator to a signed field, eliminating sprite-scale calibration guesswork.

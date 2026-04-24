---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting system**
- New `@three-flatland/nodes/lighting` entry with `Light2D`, `lit`, `normalFromHeight`, `normalFromSprite`, and shadow helpers

**Shadow tracing — `shadowSDF2D`**
- New TSL helper that sphere-traces a line from shaded fragment toward a light through an SDF texture
- Returns `[0, 1]` — 0 fully shadowed, 1 fully lit — with an IQ-style running-min penumbra term for soft edges
- Options: `steps` (default 32), `softness`, `startOffset`, `eps`
- `startOffset` skips self-shadow on the caster; `softness` controls penumbra width (8 = soft, 32 = sharp)

**Signed SDF consumption**
- `shadowSDF2D` updated to use signed SDF: self-shadow detection switches from `sdf < eps` to `sdf < 0` (strictly inside), eliminating the eps approximation

**`shadowStartOffset` uniform**
- Replaces hardcoded `escapeOffset = float(40)` with a tunable `startOffset: FloatInput` option
- `shadowBias` retains its role as the IQ hit epsilon; `shadowStartOffset` handles self-shadow escape — the two no longer mask each other
- Default raised back to 40 (matches typical 64-world-unit sprite casters) after the initial 1.5 default caused self-shadow artifacts at demo scale

**LightEffect system**
- `LightEffect` base class, `LightEffectBuildContext` (carries `lightStore`, `sdfTexture`, `worldSizeNode`, `worldOffsetNode`), ECS traits, and React attach helpers

`shadowSDF2D` delivers soft 2D SDF shadows as a drop-in TSL node; the `startOffset` uniform and signed-SDF support eliminate the prior magic-number self-shadow workaround.

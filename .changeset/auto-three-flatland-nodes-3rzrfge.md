---
"@three-flatland/nodes": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### Shadow & lighting TSL nodes

**`shadowSDF2D` — sphere-trace soft shadow**
- New TSL helper: walks a ray from fragment toward light through an SDF texture, returning a `[0,1]` shadow occlusion value
- Inigo-Quilez running-min penumbra term for soft shadow edges; `softness` controls sharpness
- Options: `steps` (default 32), `softness`, `startOffset`, `eps` (IQ hit epsilon)
- Signed SDF support: `sdf < 0` detects self-shadow inside a caster directly, no epsilon approximation

**`normalFromSprite` — alpha-gradient normal**
- Added `strength` parameter to tune normal map intensity

**Shadow uniforms**
- `shadowStartOffset` uniform introduced and then replaced by per-instance `shadowRadius` approach (see `three-flatland` changelog); `shadowBias` semantics clarified as the IQ hit epsilon only

**Cleanup**
- Removed unused lighting providers (`AutoNormalProvider`, `TileNormalProvider`) from index exports

This release adds production-quality SDF shadow ray-marching to the TSL lighting node library.

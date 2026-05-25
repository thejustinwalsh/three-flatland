---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `DefaultLightEffect`: production-ready 2D lighting preset combining Forward+ tiled culling with SDF shadow tracing
  - `shadowFilter: 'auto' | 'nearest' | 'linear'` — `auto` selects nearest for pixel-art (`shadowPixelSnapEnabled`) or linear otherwise
  - Per-category fill-light quotas: `Light2D.category` hashes to an independent 2-slot bucket; each category competes only within its own bucket
  - Hero/fill separation: shadow-casting lights bypass fill quota and cannot be evicted by cosmetic fill clusters
  - `shadowStartOffsetScale` multiplier on per-sprite `shadowRadius` replaces the old `shadowStartOffset` uniform
- `NormalMapProvider`: binds baked or runtime-generated normal maps to the lighting channel
- `./react` subpath export added to the presets package
- Removed dead per-tile `fillScale` shader compensation pass that produced tile-boundary brightness banding
- Cleaned up all `AutoNormalProvider` references (never implemented; replaced by `NormalMapProvider`)

**BREAKING CHANGES**

- `DirectLightEffect`, `SimpleLightEffect`, and `RadianceLightEffect` removed from this package (moved to a follow-up PR)
- `AutoNormalProvider` removed — use `NormalMapProvider` and the `normals` option on `SpriteSheetLoader`/`LDtkLoader`

Ships `DefaultLightEffect` and `NormalMapProvider` as the production-ready lighting preset pair, with per-category fill quotas and adaptive shadow filtering; unfinished presets moved to a follow-up PR.

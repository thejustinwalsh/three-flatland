---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**`DefaultLightEffect` lighting feature set and cleanup for the lighting-stochastic-adoption branch.**

### New API — DefaultLightEffect

- `shadowFilter` option (`auto|nearest|linear`): `auto` selects nearest when `shadowPixelSnapEnabled` (crisp pixel-art shadows) or linear otherwise; explicit override available
- Per-sprite `shadowRadius` consumed by `DefaultLightEffect.shadowStartOffsetScale` — replaces the scene-wide `shadowStartOffset` uniform; multiplier (default 1.0) scales each sprite's auto-derived radius
- `Light2D.castsShadow` gate on shadow trace: fill lights skip the 32-tap SDF trace entirely — shadow cost becomes O(casting lights) instead of O(all lights)
- Per-category fill-light quotas via hashed `Light2D.category` string (djb2, cached per unique value): up to 4 independent fill buckets, 2 fills per bucket per tile, no cross-bucket eviction
- Per-tile fill compensation scales (4 channels, one per bucket) preserve scene luminance when culled fills are absent
- `Light2D.importance` multiplicative score bias — hero lights resist eviction by dense fill clusters
- Cel-band shadow fix: `bands` quantization applied before shadow scalar recovery — shadow edge stays smooth at any `bands` value
- Rim lighting now inherits per-pixel shadow ratio (physically correct: occluded rim = no rim)

### BREAKING CHANGES

- `DirectLightEffect`, `RadianceLightEffect`, `SimpleLightEffect` removed from barrel — moved to a follow-up PR; only `DefaultLightEffect` and `NormalMapProvider` remain exported
- `AutoNormalProvider` and `TileNormalProvider` removed (dead code)
- `shadowBands` and `shadowBandCurve` uniforms removed (obsoleted by post-quantization shadow path)
- `shadowStartOffset` scene-wide uniform replaced by per-sprite `shadowRadius` + effect-level `shadowStartOffsetScale`

### Performance

- Shadow trace gated on `Light2D.castsShadow` (fill lights opt out by default)
- Redundant `lightDir.normalize()` in spot cone shader removed (direction normalized at set-site)
- Shadow trace skipped when `atten <= 0.01` (below 8-bit quantization threshold)
- Dead `fillScale` shader multiply removed (was producing tile-boundary banding)
- Dead `fillScale` meta-texel compensation pass removed (was running every frame writing nothing consumed)

Upgrades `DefaultLightEffect` with per-sprite shadow radii, per-category fill quotas, SDF filter control, and removes several obsolete lighting presets and uniforms.

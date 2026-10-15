---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- `DefaultLightEffect` is the only preset in this release; `RadianceLightEffect`, `DirectLightEffect`, and `SimpleLightEffect` removed (deferred to a follow-up PR)
- `shadowFilter` option (`auto|nearest|linear`): auto picks nearest when `shadowPixelSnapEnabled`, linear otherwise
- Per-sprite shadow radius (`Sprite2D.shadowRadius`): auto-derived from scale, overridable per-sprite; replaces the scene-wide shadow start offset magic constant
- `DefaultLightEffect.shadowStartOffsetScale` (default 1.0) is a per-effect multiplier on the per-instance radius
- `shadowBands`/`shadowBandCurve` uniforms removed; cel-banding is applied before shadow, keeping shadow edges smooth
- Shadow now applied after cel-band quantization; rim lighting inherits the same per-pixel shadow ratio
- Fill-light quotas: `castsShadow: false` lights capped at 2 per tile per category with luminance compensation scaling
- `Light2D.category` (djb2 hash, up to 4 buckets): each fill category gets independent quota and compensation, preventing cross-type eviction
- `Light2D.importance` (default 1.0): multiplicative bias for tile-slot ranking; hero lights can be set high to resist eviction by dense cosmetic clusters
- Dead per-tile `fillScale` shader multiply removed (was causing tile-boundary banding in dense fill scenes)
- Shadow trace gated on per-light `castsShadow` flag — trace cost is now O(casting lights) in dense fill scenes
- Shadow trace skipped when attenuation is sub-visible (≤ 0.01) — free savings in near-miss contributions
- Redundant `lightDir.normalize()` in spot cone math removed (direction pre-normalized at set-site)
- `NormalMapProvider` retained as the channel provider for normal maps

## BREAKING CHANGES

- `RadianceLightEffect`, `DirectLightEffect`, and `SimpleLightEffect` removed from `@three-flatland/presets`; use `DefaultLightEffect` until the follow-up PR
- `shadowBands` and `shadowBandCurve` schema uniforms removed from `DefaultLightEffect`
- `shadowStartOffset` uniform replaced by per-sprite `Sprite2D.shadowRadius` + `DefaultLightEffect.shadowStartOffsetScale` multiplier

`DefaultLightEffect` now has production-quality shadow performance and fill-light management for dense 2D scenes.

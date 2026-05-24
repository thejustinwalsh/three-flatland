---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## DefaultLightEffect

- Wired to the signed SDF pipeline: shadow traced via `shadowSDF2D` sphere-marcher; SDF texture and world bounds bound through `LightEffectBuildContext`
- Shadow applied after cel-band quantization, not before — preserves correct visual layering (`bands` quantizes unshadowed direct; per-pixel shadow ratio applied post-quantization)
- `shadowBands` / `shadowBandCurve` uniforms removed (obsoleted by post-quantization shadow application)
- Per-category fill-light compensation: `DefaultLightEffect` reads 4 per-bucket fillScale values from the tile meta texel and selects the correct scale per light via `row3.a` bucket index
- Spot cone `lightDir.normalize()` removed — direction normalized at set-site, shader call was redundant
- Shadow trace gated on `castsShadow` flag per light (`row3.b`) and attenuation threshold (`<= 0.01`), eliminating 32-tap traces for fill lights and out-of-range contributions
- `shadowStartOffsetScale` uniform (default `1.0`) replaces the old `shadowStartOffset` world-unit uniform as a multiplier on the per-sprite radius
- `NormalMapProvider`: `readFlip()` / `readSystemFlags()` / `readEnableBits()` TSL helpers replace raw attribute reads; removes the `as unknown as` cast workaround

## Changes

- `Light2D` now has `category?: string`, `importance: number`, `castsShadow: boolean` fields
- `LightEffect` system, traits, registry, and React attach helpers added
- Ambient pipeline fixed; tilemap tile-layer lighting lookup corrected for 2D texture sampling
- Example rebuilt on Tweakpane + current API post-rebase

## BREAKING CHANGES

- `DirectLightEffect`, `SimpleLightEffect`, and `RadianceLightEffect` removed from `@three-flatland/presets` exports (deferred to a follow-up PR; re-enable by importing from the `pre-lighting-bisect` tag)
- `AutoNormalProvider` was never implemented and has been removed from all documentation and error messages; use `NormalMapProvider` with `SpriteSheetLoader.normals` or `LDtkLoader.normals`
- `shadowStartOffset` uniform replaced by `shadowStartOffsetScale` (multiplier on per-sprite radius)

This release delivers a production-hardened `DefaultLightEffect` with signed SDF shadow tracing, per-category fill-light quotas, and correct shadow/cel-band stacking order.

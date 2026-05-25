---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New Features

- `shadowFilter` constant on `DefaultLightEffect` (`auto|nearest|linear`): `auto` picks nearest when `shadowPixelSnapEnabled` for crisp pixel-art shadows, linear when not
- `shadowStartOffset` tunable uniform in `DefaultLightEffect`; `shadowBias` now exclusively serves as the IQ hit epsilon (no longer overloaded)
- `shadowStartOffsetScale` effect-level multiplier on per-sprite `shadowRadius`, replacing the old scene-wide `shadowStartOffset` uniform
- `Light2D.castsShadow` (default `true`): per-light opt-out for the 32-tap SDF shadow trace, packed into `LightStore` row3.b; `DefaultLightEffect` skips traces for non-casting lights
- `Light2D.importance` (default `1.0`): multiplicative bias on tile-ranking score so hero lights (torches) resist eviction by dense cosmetic fill clusters
- `Light2D.category?: string`: per-fill-light bucket key (djb2-hashed to 0–3); each category gets independent quota and compensation in `ForwardPlusLighting`
- `NormalMapProvider` channel provider: connects normal maps to the `DefaultLightEffect` lighting pipeline
- `./react` subpath export added to `@three-flatland/presets`
- Shadow now applied post-quantization: `bands` cel-quantizes the unshadowed direct light; per-pixel shadow scalar is applied after, keeping shadow edges smooth while the direct gradient is banded
- Rim lighting inherits per-pixel shadow ratio when `rimIntensity > 0` (physically: rim from an occluded light should be occluded)

## Performance

- Forward+ tile size bumped 16 → 32 px (4× CPU tile-assignment speedup at high light counts)
- Shadow trace skipped for `castsShadow: false` lights (cost scales with shadow-casting count only)
- Shadow trace skipped when attenuation is below 8-bit visibility threshold (≤ 0.01)
- Dropped redundant `lightDir.normalize()` in per-tile per-light spot-cone shader loop
- Removed dead `fillScale`/tile-meta compensation pass (per-bucket eviction quota replaced it)
- Interleaved core instance buffer: UV/color/system/extras collapsed to one binding, freeing 3 WebGPU vertex buffer slots

## Bug Fixes

- Fixed CPU tile-bounds drift vs. shader screen-pixel tile math (`tileWorldStride = TILE_SIZE / screenSize * worldSize`)
- Fixed per-tile fill-scale tile-boundary brightness banding: dropped shader-side `fillScale` multiply; quota-based eviction prevents fill-light domination without the banding artifact
- Fixed ambient pipeline

## Removals

- `DirectLightEffect`, `SimpleLightEffect`, `RadianceLightEffect` moved to a follow-up PR (not in this release)
- `shadowBands`/`shadowBandCurve` uniforms removed (obsoleted by post-quantization shadow application)
- `AutoNormalProvider` (never implemented) fully cleaned from error messages, docs, and planning files

`@three-flatland/presets` ships a production-ready `DefaultLightEffect` with per-light shadow gating, per-category fill quotas, and pixel-art-friendly shadow filtering.

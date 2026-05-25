---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changelog

### DefaultLightEffect

- Full 2D lighting pipeline wired end-to-end: `DefaultLightEffect` integrates Forward+ tiled culling, SDF sphere-trace shadows, normal-map shading, ambient, rim, and cel-banding in one TSL material effect
- `shadowFilter` option (`auto | nearest | linear`): `auto` picks nearest when `shadowPixelSnapEnabled` for crisp pixel-art shadows, linear otherwise
- `shadowStartOffsetScale` (multiplier on per-sprite `shadowRadius`) replaces the old fixed `shadowStartOffset` uniform — scales automatically with each sprite's size
- Shadow post-quantization fix: `bands` cel-banding now quantizes unshadowed direct light; shadow scalar is recovered as a ratio and applied after — shadow edges stay smooth when bands > 0
- Rim lighting now inherits the per-pixel shadow ratio (physically correct: rim from an occluded light is itself occluded)
- `shadowBias` retains IQ-hit-epsilon semantics; `shadowStartOffset`/`shadowStartOffsetScale` handle self-shadow escape exclusively
- Dropped `shadowBands` / `shadowBandCurve` uniforms (obsoleted by post-quantization approach)
- Shadow trace gated on per-light `castsShadow` flag: O(shadow-casting lights) instead of O(all lights)
- Shadow trace skipped when attenuation ≤ 0.01 (sub-visible, below 8-bit quantization threshold)
- Spot cone math: dropped redundant `lightDir.normalize()` (direction is normalized at set-site; saves a `rsqrt` + 2 muls per spot light per fragment)

### Forward+ lighting

- `Light2D.importance` (default 1.0): multiplicative ranking bias; hero/torch lights resist eviction by dense cosmetic clusters
- `Light2D.category?: string`: djb2-hashed at set-time to a 4-bucket index; each category gets independent per-tile quota and compensation — slime glows and water ripples no longer compete for the same 2 slots
- Fill lights (`castsShadow: false`) capped at `MAX_FILL_LIGHTS_PER_TILE` (2) per category per tile; culled fills accumulate a compensation scale written to the tile meta texel so total luminance is preserved
- Removed dead `fillScale` tile-meta compensation shader multiply (produced tile-boundary banding); fill intensity compensation retained in CPU tracking for future temporal path
- Fixed CPU tile bounds: tile stride now computed as `TILE_SIZE / screenSize * worldSize` to match the shader's screen-pixel tile math — eliminates tile-wide checkerboard gaps at non-multiple-of-32 viewport heights
- `TILE_SIZE` bumped 16 → 32: 4× fewer tiles at 1920×1080, proportional CPU cull speedup; per-fragment shader cost unchanged

### Presets package structure

- `DirectLightEffect`, `RadianceLightEffect`, `SimpleLightEffect` moved out to a follow-up PR; barrels trimmed to `DefaultLightEffect` + `NormalMapProvider` only
- `@three-flatland/presets` gains `./react` subpath export and declares `@react-three/fiber` as optional peer dep

`@three-flatland/presets` now ships a production-ready `DefaultLightEffect` with signed-SDF shadows, per-category fill-light quotas, and automatic per-sprite shadow escape — no magic constants required.

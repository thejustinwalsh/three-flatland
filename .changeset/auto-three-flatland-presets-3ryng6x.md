---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changes

**`DefaultLightEffect` — shadow pipeline**
- `shadowSDF2D` wired in as the primary shadow path; replaces the `shadow = float(1.0)` stub
- Per-light `castsShadow` gate: shadow trace skipped for lights where `castsShadow: false`; saves 32-tap trace cost for cosmetic fill lights
- Attenuation gate: shadow trace skipped when `atten <= 0.01` (sub-visible, below 8-bit quantization)
- `shadowStartOffset` schema uniform (replaces hardcoded 40-unit escape offset); later superseded by per-sprite `shadowRadius` via `shadowStartOffsetScale`
- Shadow applied after cel-band quantization: `bands` stair-steps the direct gradient, shadow ratio recovered as shadowed/unshadowed and applied post-quantize — eliminates stepped-shadow artifact at `bands > 0`
- Rim lighting inherits per-pixel shadow ratio (previously rim was unshadowed)
- `shadowBands` / `shadowBandCurve` uniforms removed (obsoleted by post-quantize shadow application)
- Spot cone `lightDir.normalize()` removed from per-fragment loop (direction normalised at set-site on `Light2D`)
- `shadowPixelSize` uniform: world-unit snap on the trace origin for retro blocky shadow look

**`DefaultLightEffect` — fill-light management**
- Fill lights (`castsShadow: false`) capped at `MAX_FILL_LIGHTS_PER_TILE` (2) per tile; hero lights (`castsShadow: true`) bypass dedup and are never evicted by fills
- `Light2D.importance` (default 1.0): multiplicative bias on tile-ranking score; set higher values to resist eviction by dense fill clusters
- `Light2D.category?: string`: string hashed via djb2 to a 2-bit bucket (0–3); each category has its own independent fill quota and compensation scale
- Per-tile compensation scale (`fillScale = inRange / kept`) preserved in tile meta texel per category; compensates luminance when fills are culled (safe for non-shadow-casting lights)
- Per-tile fill-scale shader multiply removed (produced tile-boundary brightness banding in dense scenes); compensation data retained for future temporal path

**`DefaultLightEffect` — Forward+ performance**
- `TILE_SIZE` bumped from 16 → 32 px: 4× fewer CPU tiles at 1920×1080, proportional speedup in `ForwardPlusLighting.update`
- CPU tile bounds aligned to shader tile math (`tileWorldStride = TILE_SIZE / screenSize * worldSize`): fixes tile-boundary gaps in fill-light coverage visible when viewport height is not a multiple of `TILE_SIZE`
- Default SDF resolution scale changed to 0.5× for better performance

**`NormalMapProvider`**
- Updated to use interleaved instance attributes (`readFlip()`, `readSystemFlags()`, etc.) instead of raw `attribute(...)` reads; removed `as unknown as` cast

**Removed presets (moved to follow-up PR)**
- `DirectLightEffect`, `SimpleLightEffect`, `RadianceLightEffect` removed from public exports; `RadianceCascades` also removed
- `directLightEffect`, `simpleLightEffect`, `radianceLightEffect` JSX element types removed from `ThreeElements` augmentation

## BREAKING CHANGES

- `DirectLightEffect`, `SimpleLightEffect`, and `RadianceLightEffect` are no longer exported; use `DefaultLightEffect` + `NormalMapProvider`
- `shadowBands` and `shadowBandCurve` uniforms removed from `DefaultLightEffect` — use `shadowPixelSize` for retro pixel-snapped shadows
- `shadowStartOffset` uniform replaced by `shadowStartOffsetScale` (multiplier on per-sprite `Sprite2D.shadowRadius`)

Hardens the `DefaultLightEffect` shadow pipeline with per-light gating, cel-band-correct quantization, per-category fill-light management, and Forward+ tile-alignment fixes; removes unimplemented preset variants.

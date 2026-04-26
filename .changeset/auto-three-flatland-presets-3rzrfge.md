---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### Shadow pipeline

- `DefaultLightEffect` and `DirectLightEffect` now use `shadowSDF2D` for SDF sphere-trace shadows — the `shadow = float(1.0)` stub is gone
- `shadowStrength`, `shadowSoftness`, `shadowBias`, `shadowPixelSize` uniforms control shadow appearance
- Shadow trace gated on: ambient check, N·L attenuation, `atten <= 0.01` threshold, and per-light `castsShadow` flag — skips expensive 32-tap trace for invisible contributions
- Removed `shadowBands` / `shadowBandCurve` uniforms (replaced by post-quantization approach)
- Cel-banding (`bands > 0`) now quantizes unshadowed direct light; shadow factor applied after, keeping shadow edges smooth
- Rim lighting inherits per-pixel shadow ratio when enabled
- `shadowStartOffsetScale` per-effect multiplier on per-instance `shadowRadius` (replaces old scene-wide `shadowStartOffset` uniform)
- Spot light `lightDir.normalize()` removed from per-fragment loop (direction normalized at set-site)

### Fill-light system

- `Light2D.category?: string` — assign fill lights to named buckets (hashed via djb2, cached per instance); each category gets independent tile quota and compensation
- `Light2D.importance?: number` (default 1.0) — multiplicative bias on tile-ranking score; set high values on torches/hero lights to resist eviction by dense fill clusters
- Per-tile fill quota: 2 fill slots per category per tile; fills only compete within their own bucket
- Dropped per-tile `fillScale` shader multiply that caused tile-boundary brightness banding; fill lights contribute at natural intensity

### Cleanup

- Removed unused `AutoNormalProvider`, `TileNormalProvider` providers
- Added `./react` subpath export to package

This release delivers production-quality SDF shadow tracing with per-light control and a robust fill-light system for dense particle-light scenes.
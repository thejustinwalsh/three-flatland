---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### DefaultLightEffect — shadow pipeline

- SDF shadow tracing wired end-to-end: `shadowSDF2D` replaces the `shadow = 1.0` stub; `shadowStrength` and `shadowSoftness` uniforms control intensity and penumbra
- Shadow applied after cel-band quantization (`bands` uniform): direct-light gradient steps cleanly, shadow edge stays smooth; fixes stepped-shadow artifact when `bands > 0`
- Rim lighting now inherits the per-pixel shadow ratio (physically correct when a light is occluded)
- `shadowFilter` constant (`'auto' | 'nearest' | 'linear'`, default `'auto'`): nearest when `shadowPixelSnapEnabled` for crisp pixel-art shadows, linear otherwise; explicit values override
- `shadowPixelSize` uniform for world-unit snap on the trace origin (retro blocky shadow look)
- `shadowBands` / `shadowBandCurve` uniforms removed — post-quantization makes them redundant

### Shadow performance

- Shadow trace gated on per-light `castsShadow` flag: O(casting lights) instead of O(all lights) for scenes with many cosmetic fills
- Shadow trace skipped when attenuation is sub-visible (≤ 0.01) — no perceptible delta at 8-bit precision
- Spot cone `normalize()` removed from per-fragment loop (direction is normalized at set-time, invariant through DataTexture upload)

### Per-sprite shadow radius

- `DefaultLightEffect.shadowStartOffsetScale` (default 1.0) replaces the scene-wide `shadowStartOffset` uniform; scales each sprite's own `shadowRadius` per-instance so different-sized casters get correct escape distances automatically

### Forward+ fill-light management

- `Light2D.category?: string` — hashed via djb2 to a 2-bit bucket index (0..3); each category gets independent quota + compensation so mixed fill types don't compete
- `Light2D.importance` (default 1.0) — multiplicative ranking bias; hero lights (e.g. torches, `importance=10`) resist eviction by dense cosmetic clusters
- Fill lights (`castsShadow: false`) capped at 2 per tile per category; hero lights bypass the quota and are never evicted by fills
- Dead `fillScale` shader multiply removed: caused tile-boundary brightness banding; CPU-side tracking preserved for future temporal compensation path
- Dead `fillScale`/tile-meta compensation pass removed: leftover from an unwired approach; quota eviction handles the job
- CPU tile-bounds alignment fixed: tile world-space AABBs now use the same stride as the shader (`TILE_SIZE / screenSize * worldSize`) — eliminates checkerboard fill gaps at non-TILE_SIZE-multiple viewport sizes

### Bisect / removed

- `DirectLightEffect`, `SimpleLightEffect`, `RadianceLightEffect` moved to a follow-up PR; `DefaultLightEffect` + `NormalMapProvider` are the shipped presets
- `AutoNormalProvider` removed (was never implemented); error messages now point at `NormalMapProvider` and the loader auto-bake path
- `./react` subpath export added to the presets package

### Refactors

- TSL instance attribute helpers (`readFlip`, `readSystemFlags`, `readEnableBits`, `readLitFlag`, etc.) consumed throughout; raw `attribute(...)` reads removed from `NormalMapProvider`

Integrates the full 2D shadow pipeline into `DefaultLightEffect` with per-category fill-light quotas, per-instance shadow radii, and several shader-cost optimizations.

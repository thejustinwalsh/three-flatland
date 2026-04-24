---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Lighting effects**

- `DefaultLightEffect` and `DirectLightEffect` now perform real SDF shadow tracing via `shadowSDF2D`; the `shadow = float(1.0)` stub is gone
- Per-light `castsShadow` flag gates the 32-tap shadow trace in `DefaultLightEffect`; lights with `castsShadow: false` skip tracing entirely, reducing cost to O(casting lights) in dense scenes
- Shadow trace skipped when attenuation is sub-visible (≤ 0.01), eliminating traces for near-miss contributions at the edge of the attenuation curve
- Shadow applied after cel-band quantization: `bands` stair-steps the direct gradient while the shadow edge stays smooth; rim lighting now inherits the same per-pixel shadow ratio
- Removed `shadowBands` / `shadowBandCurve` uniforms (obsoleted by post-quantization shadow application)
- `DefaultLightEffect.shadowStartOffsetScale` (default 1.0) replaces the scene-wide `shadowStartOffset` as a per-instance multiplier on sprite radius
- `shadowBias` (IQ hit epsilon) and `shadowStartOffset` (self-shadow escape) are now independent uniforms with distinct semantics
- Spot light `normalize()` call removed from the inner per-tile loop (direction is already unit-length at upload); free ALU saving per spot fragment
- `@three-flatland/presets` gains a `./react` subpath export

**Normal providers**

- `NormalMapProvider` migrated to typed TSL helpers (`readFlip()`, `readSystemFlags()`) — removes the `as unknown as` cast on the raw attribute read

**Lighting providers**

- Removed unused `AutoNormalProvider`, `TileNormalProvider`, `SimpleLightEffect`, `RadianceLightEffect` and stale loader stubs; codebase trimmed by ~1 500 lines

This release completes the first end-to-end shadow pipeline: SDF generation, per-light shadow tracing, per-sprite radius auto-sizing, and cel-shade-compatible shadow compositing all work together out of the box.

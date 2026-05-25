---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/presets

### New features

- **`DefaultLightEffect`** — comprehensive 2D lighting shader preset:
  - `shadowFilter: 'auto' | 'nearest' | 'linear'`: selects SDF sample filter automatically (nearest when `shadowPixelSnapEnabled`, linear otherwise) or via explicit override
  - `shadowPixelSize`: world-unit snap on the trace origin for retro blocky shadows
  - `bands` / `band curve`: cel-band quantization of direct light; shadow is now applied after quantization so the shadow edge stays smooth while direct light stair-steps
  - `rimIntensity`: rim lighting that inherits the per-pixel shadow ratio
  - `shadowStartOffsetScale`: per-sprite multiplier on `Sprite2D.shadowRadius`; replaces the old scene-wide `shadowStartOffset` uniform
  - `shadowBias` / `shadowStartOffset` split: `shadowBias` is the IQ hit epsilon, `shadowStartOffset` is the self-shadow escape — neither can mask the other
  - Shadow trace gated on `castsShadow` per-light flag: O(casting lights) cost in scenes with cosmetic fill lights
  - Shadow trace gated on attenuation threshold (≤ 0.01): sub-visible contributions skip the 32-tap trace for free

- **Fill-light quotas** (Forward+ lighting):
  - `Light2D.importance` (default 1.0): multiplicative priority bias; hero lights set high to resist eviction by dense fill clusters
  - `Light2D.category?: string`: hashed via djb2 to a 2-bit bucket; each category has an independent per-tile fill quota so mixed fill types don't starve each other
  - Fill lights (`castsShadow: false`) capped at 2 per tile per category; hero lights bypass the dedup path entirely
  - Removed: dead `fillScale` meta-texel compensation pass (superseded by per-bucket group-max quota)

- **`NormalMapProvider`**: updated to use `readFlip()` TSL helper from `instanceAttributes`

### Breaking changes

- `RadianceLightEffect`, `DirectLightEffect`, and `SimpleLightEffect` removed from the public export (moved to a follow-up PR); `DefaultLightEffect` + `NormalMapProvider` are the supported presets
- `shadowBands` and `shadowBandCurve` uniforms removed — shadow post-quantization replaces the per-light shadow bit-crush pass; use `bands` on the main lighting effect
- `ThreeElements` augmentations for `directLightEffect`, `simpleLightEffect`, `radianceLightEffect` removed from the `react` subpath

### BREAKING CHANGES

`RadianceLightEffect`, `DirectLightEffect`, `SimpleLightEffect`, `shadowBands`, and `shadowBandCurve` have been removed. Migrate to `DefaultLightEffect` with the `bands` uniform and the `castsShadow` per-light flag.

This release brings `DefaultLightEffect` to production quality with per-sprite shadow radii, per-category fill-light quotas, configurable cel-banding, and a `shadowFilter` option for pixel-art vs. smooth shadow edges.

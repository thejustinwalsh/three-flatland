---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**DefaultLightEffect** — production-quality 2D lighting preset with Forward+ culling and SDF soft shadows.

**Shadow system**
- SDF soft shadows via `shadowSDF2D`: 32-tap sphere-trace producing smooth penumbra per Inigo Quilez
- `shadowStartOffsetScale` (effect-level multiplier on per-sprite radius) replaces the old scene-wide `shadowStartOffset` uniform
- Shadow skipped early when `castsShadow: false` on a light, when attenuation is sub-visible (≤ 0.01), or when the light is ambient — O(casting lights) shadow cost in dense scenes
- Shadow applied after cel-band quantization so `bands > 0` stair-steps the direct gradient without stepping shadow edges
- `shadowBias` (IQ hit epsilon) and `shadowStartOffset` (self-shadow escape) are now separate uniforms
- `shadowPixelSize`: world-unit snap on trace origin for a retro blocky shadow look
- `shadowBands` / `shadowBandCurve` removed (superseded by post-quantization shadow application)
- Redundant `normalize()` on `lightDir` removed from spot cone math (direction is pre-normalized at set-site)

**Per-light `castsShadow` flag**
- `Light2D.castsShadow` (default `true`): opt individual lights out of shadow tracing; packed into LightStore DataTexture row3.b

**Fill-light management for dense scenes**
- `Light2D.importance` (default `1.0`): multiplicative bias on tile-ranking; hero lights with high importance resist eviction by dense fill clusters
- Fill lights (`castsShadow: false`) capped at 2 slots per tile per category; hero lights compete independently
- `Light2D.category?: string`: hashed to a bucket index (0–3) so distinct fill types (e.g. `"slime"`, `"water"`) each get independent quota and per-tile luminance compensation
- Per-tile compensation (`fillScale`) preserves total luminance when culled fills are not represented; per-category scales emitted in tile meta texel channels x/y/z/w

**Normal map wiring**
- `NormalMapProvider`: TSL channel node that sources per-instance normal maps into the lit pipeline; updated to use typed `readFlip()` helper

**Bisect note**
- `RadianceLightEffect`, `DirectLightEffect`, and `SimpleLightEffect` have been moved to a follow-up PR and are not part of this release; `DefaultLightEffect` + `NormalMapProvider` are the supported presets

**Instance attribute helpers**
- `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()` helpers used internally; NormalMapProvider migrated off raw `attribute(...)` reads

This release ships `DefaultLightEffect` as a complete, performance-tuned 2D lighting solution with per-light shadow opt-out, dense-scene fill management, and cel-shading compatible shadow application.

---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**DefaultLightEffect — shadow pipeline**
- `shadowSDF2D` wired into the per-tile light loop; replaces `shadow = float(1.0)` stub for both `DefaultLightEffect` and `DirectLightEffect`
- Per-light `castsShadow` gate: shadow trace skipped for lights with `castsShadow: false` — O(casting lights) instead of O(total lights) for dense cosmetic-fill scenes
- Attenuation sub-visible gate: SDF trace skipped when `atten <= 0.01`, below 8-bit quantization threshold
- `shadowStartOffset` tunable uniform (default 40) — self-shadow escape distance, split from `shadowBias` (IQ hit epsilon)
- `shadowStartOffsetScale` per-effect multiplier on per-sprite `shadowRadius` replaces the old scene-wide uniform
- `shadowPixelSize` — world-unit snap on trace origin for retro blocky shadow look
- `bands` quantization now applied to unshadowed direct accumulation; shadow scalar recovered as ratio and applied after quantize, keeping shadow edges smooth at non-zero band counts
- `shadowBands`/`shadowBandCurve` uniforms removed (obsoleted by post-quantize shadow application)
- `rimIntensity` rim lighting now correctly inherits the same per-pixel shadow ratio as direct
- Redundant `lightDir.normalize()` in spot cone math removed (direction normalized at set-site)

**Forward+ lighting — fill-light management**
- `Light2D.category?: string` — hashed via djb2 to one of 4 buckets; each category gets its own fill-light quota (2 per tile) and compensation scale, fixing mixed-fill scenes where distinct fill types competed for the same slots
- `Light2D.importance?: number` — multiplicative bias on tile-ranking score; hero lights can be set high to resist eviction by dense fill clusters
- `Light2D.castsShadow` field and `clone()` preservation; packed into `LightStore` row3.b for shader consumption
- Per-tile fillScale compensation dropped from shader (caused visible tile-boundary banding); CPU-side tracking preserved for future temporal compensation path
- TILE_SIZE bumped 16 → 32 for ~4× CPU tile-assignment speedup at 1920×1080; max tiles 65,536 → 32,768 (covers 8K canvas at TILE_SIZE=32)
- CPU tile bounds now align with shader's screen-pixel tile math, fixing checkerboard gaps in fill coverage at non-multiple-of-TILE_SIZE viewport heights

**Per-sprite shadow radius**
- `Sprite2D.shadowRadius?: number` — `undefined` (default) auto-derives from `max(|scale.x|, |scale.y|)` each frame; explicit value overrides; preserved across `clone()`
- `DefaultLightEffect.shadowStartOffsetScale` (0–3 slider) replaces old per-scene `shadowStartOffset` slider

**Lighting effect system**
- `DefaultLightEffect`, `DirectLightEffect`, `SimpleLightEffect` — three preset strategies for tiled Forward+ lighting with SDF shadows
- `sdfTexture`, `worldSizeNode`, `worldOffsetNode` threaded through `LightEffectBuildContext` for all effects
- `@three-flatland/presets/react` subpath export for R3F `ThreeElements` augmentation; `@react-three/fiber` declared as optional peer dep

Initial minor release of `@three-flatland/presets`: production-ready lighting effects including SDF shadow tracing, fill-light quota management, and per-sprite shadow radii.

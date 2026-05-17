---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**DefaultLightEffect**
- `shadowSDF2D` wired in — replaces the `shadow = float(1.0)` stub; controlled by `shadowStrength`, `shadowSoftness`, `shadowBias`, and `shadowStartOffset` uniforms
- `shadowStartOffset` replaces `shadowBias` for the self-shadow escape distance; `shadowBias` is now exclusively the IQ hit epsilon — semantics no longer overlap
- Per-light `castsShadow` gate on the shadow trace — shadow cost scales with casting lights only, not total light count
- Shadow trace skipped when attenuation is below 8-bit visibility threshold (sub-0.01 atten)
- Shadow applied after cel-band quantization so stair-steps affect the direct gradient, not the shadow edge
- Removed `shadowBands` / `shadowBandCurve` uniforms — superseded by post-quantization shadow handling
- `shadowStartOffset` default set to 40 world units (covers 64u knight silhouette out-of-the-box)
- `shadowStartOffsetScale` effect-level multiplier replaces the old scene-wide offset uniform
- Dropped per-tile `fillScale` shader multiply — eliminates tile-boundary brightness banding in dense fill-light scenes
- Redundant `lightDir.normalize()` removed from spot cone inner loop (rsqrt + 2 muls per fragment per spot, no behavior change)

**Light categorization**
- `Light2D.category?: string` — fill lights hash to one of 4 independent buckets via djb2; each bucket has its own 2-slot quota and per-tile `fillScale` compensation
- `Light2D.importance` (default `1.0`) — multiplicative ranking bias; hero lights resist eviction by dense cosmetic clusters
- `Light2D.castsShadow` flag packed into `LightStore` row 3, column B; `clone()` preserves it

**Forward+ lighting**
- Per-category fill-light quotas: 2 slots per bucket per tile; fills only evict fills within the same bucket
- CPU tile-bounds math aligned with the shader's `floor(screenPos / TILE_SIZE)` stride — eliminates tile-boundary gaps in fill coverage at non-multiple-of-32 viewport heights
- `TILE_SIZE` bumped from 16 → 32 (4× fewer CPU tiles, same per-fragment shader cost)
- Tile storage layout expanded from stride=4 to stride=8; meta texel carries 4 per-bucket `fillScale` values

**Per-sprite shadow radius**
- `Sprite2D.shadowRadius?: number` — auto-derived from `max(|scale.x|, |scale.y|)` when unset; explicit override for sprites with transparent padding; preserved across `clone()`
- `readShadowRadius()` TSL helper for shader consumption

**Instance buffer**
- Core instance data interleaved into a single `InstancedInterleavedBuffer` (64 bytes / 16 floats per instance): `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`; frees 3 of WebGPU's 8 vertex-buffer slots for `effectBuf` growth
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` cap with a clear error at registration time instead of a silent GPU pipeline rejection
- TSL instance-attribute helpers (`readFlip`, `readSystemFlags`, `readEnableBits`, `readLitFlag`, `readShadowRadius`, `readReceiveShadowsFlag`, `readCastShadowFlag`) moved to `materials/instanceAttributes.ts`

**Preset cleanup**
- `RadianceLightEffect`, `DirectLightEffect`, `SimpleLightEffect`, and `AutoNormalProvider` removed from the barrel; `DefaultLightEffect` + `NormalMapProvider` remain
- `@three-flatland/presets` gains `./react` subpath export and declares `@react-three/fiber` as an optional peer dep

**Normal map**
- `NormalMapProvider` replaces `AutoNormalProvider` in docs and error messages; SpriteSheetLoader / LDtkLoader auto-bake normals via `resolveNormalMap` when sidecars are missing

Lighting is production-ready for scenes using `DefaultLightEffect` with `NormalMapProvider`; the SDF shadow pipeline is end-to-end for point/spot lights with correct penumbra and per-sprite self-shadow escape.


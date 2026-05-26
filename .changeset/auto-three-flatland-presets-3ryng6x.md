---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27


## @three-flatland/presets

### DefaultLightEffect — new features
- `shadowFilter` option (`auto|nearest|linear`): auto picks nearest when `shadowPixelSnapEnabled` (pixel-art crisp shadows), linear otherwise
- `shadowStartOffset` tunable uniform replaces the hardcoded 40-unit `escapeOffset`; default 1.5 world units (signed SDF makes this safe)
- `shadowStartOffsetScale` effect-level multiplier (0–3, default 1.0) on per-sprite shadow radius, replacing the single scene-wide slider
- `shadowPixelSize` world-unit snap on trace origin for retro blocky shadow look
- `bands` quantizes direct-light gradient (cel-shading); applied BEFORE shadow scalar so shadow edges stay smooth
- Shadow is now applied AFTER cel-band quantization; rim lighting inherits the per-pixel shadow ratio
- `rimIntensity` exposed; rim is now shadowed when a light is occluded (physically correct)
- `shadowBias` is the IQ hit epsilon; `shadowStartOffset` handles self-shadow escape (semantics no longer overloaded)
- `shadowBands`/`shadowBandCurve` uniforms removed (superseded by post-quantization shadow path)

### DefaultLightEffect — performance
- Shadow trace gated on `castsShadow` flag per light — cosmetic fill lights (slimes, particles) never pay 32-tap SDF cost
- Shadow trace skipped when attenuation is sub-visible (`atten <= 0.01`)
- Redundant `lightDir.normalize()` in spot cone math removed (direction is normalized at set-site)
- Dead `fillScale` shader multiply removed; per-tile compensation pass eliminated (meta texels were never consumed)
- Zero-alloc per-frame `runtimeCtx` — module-level scratch object, mutated in place

### Forward+ light culling
- Hero lights (`castsShadow: true`) bypass fill-slot competition; fills (`castsShadow: false`) capped at 2 per tile
- Per-category fill quotas via `Light2D.category?: string` — djb2-hashed to bucket 0–3, each bucket has independent quota/compensation
- `Light2D.importance` (default 1.0) — multiplicative bias on tile-ranking score for hero lights
- CPU tile-world-bound computation now matches shader's `floor(screenPos / TILE_SIZE)` math (fixes tile-boundary checkerboard gaps at non-multiple-of-TILE_SIZE viewports)
- Tile storage layout: `TILE_STRIDE=8` for cache-line alignment, 4 light index slots + 4 meta slots
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` cap with a clear error on overflow (prevents silent WebGPU pipeline rejection)

### Instance buffer refactor
- Core per-instance data (UV, color, flip, system flags, enable bits, shadow radius) interleaved into a single `InstancedInterleavedBuffer` with 4 attribute views — frees 3 WebGPU vertex buffer slots (was at the `maxVertexBuffers=8` cap)
- New typed TSL helpers: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()` — internal layout refactorable in one file
- `effectBuf0+` is now pure `MaterialEffect` data with no reserved core slots; effect-slot allocator starts at offset 0
- Per-sprite `shadowRadius` attribute: auto-derives from `max(|scale.x|, |scale.y|)` each frame; `Sprite2D.shadowRadius?: number` overrides

### NormalMapProvider
- Reads `readFlip()` helper instead of raw attribute access (removed `as unknown as` cast)

### Shadow pipeline
- `shadowPipelineSystem` moved to `append` position — runs after `conditionalTransformSyncSystem + flushDirtyRangesSystem` so the occluder pre-pass sees current-frame matrices (fixes one-frame shadow lag on moving casters)
- Occluder-dirty gate: SDF regen skipped when occluders and camera frustum/position/zoom are unchanged — free in manual-invalidate scenes
- `SDFGenerator` now runs dual JFA chains (signed SDF: outside + inside distance)
- Debug buffer names: `sdf.jfaPing/PongOutside` and `sdf.jfaPing/PongInside`
- SDF + blur RT sample filter controlled by `shadowFilter`; JFA ping-pong stays nearest

### Removed presets (bisected to follow-up PR)
- `DirectLightEffect`, `RadianceLightEffect`, `SimpleLightEffect` moved out; `DefaultLightEffect` + `NormalMapProvider` remain
- `AutoNormalProvider` refs cleaned from error messages, docs, comments, and planning docs
- `presets` package now declares `@react-three/fiber` as optional peer dep and exports `./react` subpath

### Loaders
- `forceRuntime` replaces `skipBakedProbe` / `disableRuntimeBake` across `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`

This release ships the full 2D lighting pipeline: Forward+ culling with per-category fill quotas, signed-SDF sphere-trace shadows, per-sprite shadow radii, and cel-shading with clean shadow edges.

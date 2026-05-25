---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changelog

### 2D lighting system

- New `Light2D` class with point, directional, ambient, and spot types; `castsShadow` flag (default true) and `importance` bias for hero/fill light bucketing; `category?: string` for per-category fill quotas
- `Flatland.setLighting(effect)` wires a `LightEffect` into the ECS; eagerly allocates `SDFGenerator` + `OcclusionPass` before shader build so the SDF texture reference is stable at compile time
- JFA-based `SDFGenerator`: packed RGBA signed SDF in a single ping-pong chain — outside seed in RG, inside seed in BA; signed distance (positive outside, negative inside occluders) at the same VRAM cost as the old unsigned generator
- SDF `OcclusionPass` default resolution scale 0.5; separable 5-tap binomial blur for smooth shadow transitions
- `SDFGenerator.setFilter()`: retargets SDF + blur RT sampling between nearest and linear; JFA ping-pong stays nearest
- Shadow pipeline skips occluder render + ~15-pass JFA/blur regen when occluders and camera frustum/position/zoom are unchanged (`occludersDirty` gate via `BucketedDirtyTracker`)
- `shadowPipelineSystem` runs after `conditionalTransformSyncSystem` + `flushDirtyRangesSystem` — occluder pre-pass sees freshly uploaded matrices, eliminating one-frame shadow lag on moving casters
- SDF no longer freezes on `OrthographicCamera.zoom` changes: `lastZoom` tracked in the dirty gate

### Per-sprite shadow radius

- `Sprite2D.shadowRadius?: number`: optional override for the shadow escape distance; `undefined` (default) auto-resolves to `max(|scale.x|, |scale.y|)` per frame via `transformSyncSystem`
- Per-instance `shadowRadius` packed into the interleaved instance buffer; `readShadowRadius()` TSL helper exposes it in shaders
- `DefaultLightEffect.shadowStartOffsetScale` (multiplier, default 1.0) replaces the old scene-wide `shadowStartOffset` uniform

### Forward+ lighting

- `Light2D.castsShadow` packed into `LightStore` row3.b; `Light2D.category` hashed via djb2 to a 4-bucket index packed into row3.a
- Fill lights (`castsShadow: false`) capped at 2 per category per tile with luminance-preserving compensation; hero lights (`castsShadow: true`) bypass fill quotas entirely
- Per-category independent quotas prevent mixed fill types from competing for the same slots
- CPU tile bounds use `TILE_SIZE / screenSize * worldSize` stride to match the shader's screen-pixel math — eliminates tile-wide checkerboard gaps at non-multiple-of-tile-size viewport heights
- `TILE_SIZE` 16 → 32: ~4× fewer tiles at 1920×1080, proportional CPU cull speedup
- `LightStore.lightsTexture` and `ForwardPlusLighting._tileTexture` registered as devtools debug textures

### Instance buffer layout

- Core per-instance data interleaved into a single `InstancedInterleavedBuffer` with four attribute views: `instanceUV` (offset 0), `instanceColor` (4), `instanceSystem` (8), `instanceExtras` (12)
- Collapses 3 vertex buffer bindings into 1, freeing 3 slots within WebGPU's `maxVertexBuffers=8` cap for effect buffer growth
- `effectBuf0+` is now pure `MaterialEffect` data with no reserved slots; allocator starts at offset 0
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` (3 effectBufs × 4 floats); throws a clear error at `registerEffect` when the cap would be exceeded
- TSL instance attribute helpers moved to `materials/instanceAttributes.ts`: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readShadowRadius()`, `readCastShadowFlag()`, `readReceiveShadowsFlag()`

### Normal-map loaders

- `NormalDescriptorLoader` (`loaders/normalDescriptor.ts`): loads a `.normal.json` descriptor and resolves the referenced atlas + region list
- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`: `normals` option accepts `true | NormalSourceDescriptor`; `forceRuntime: true` skips the baked-sidecar probe (renamed from `skipBakedProbe`; `disableRuntimeBake` dropped)
- `MaterialEffect.elevation` channel support added

### Devtools streaming and instrumentation

- Debug texture readbacks moved to `endFrame()` after all render passes complete — no more partial-frame captures in SDF visualization
- `pixel-convert.ts`: worker-side RGBA8 conversion for rgba8, r8, rgba16f (manual half-float decode), rgba32f with display modes colors / normalize / mono / signed / alpha; handles WebGPU 256-byte row padding
- `DebugTextureRegistry` downsample cap: render targets > `maxDim` blitted to a scratch RT before readback (1920×1080 SDF → ~150 KB instead of 8 MB)
- Medium pool tier (256 KB) for the per-flush data packet; `large` tier reserved for texture readback only — eliminates mark-compact GC every `STATS_BATCH_MS` when the dashboard is active
- ECS schedule perf-track instrumentation gated on dev-mode only: production Knightmark builds no longer pay per-system measurement overhead
- `DevtoolsProvider` constructor side-effect-free; explicit `start()`/`dispose()` lifecycle, multi-cycle safe; `Flatland.render()` lazy-starts on first call
- `DEVTOOLS_BUNDLED` re-export removed; devtools dead-stripped via inlined `process.env` gate (production bundle: 45.4 KB → 36.3 KB)
- Force keyframe on buffer switch in VP9 stream mode to prevent decoder waiting on a keyframe that never arrives
- Registered debug textures: `sdf.distanceField` (signed, rgba16f), `occlusion.mask` (mono, rgba8), `sdf.jfaPing/Pong`, radiance cascade levels

### Sprite performance

- `AnimatedSprite2D.update` callbacks hoisted to bound instance fields — no per-sprite-per-frame arrow closure allocation
- `writeShadowRadius` idempotent: skips buffer write + dirty mark when scale is unchanged (static-scale scenes stop re-uploading the whole interleaved instance buffer every frame)
- `Sprite2D` tint/anchor delegated to `observable.color.attach` / `observable.vector2.attach`; ~100 lines of inline duplicate removed; `SpriteGroup` test locks the R3F in-place `tint.set()` → batch-buffer path
- Zero-alloc light-effect runtime context: per-frame `runtimeCtx` object literal hoisted to a module-level scratch; `LightingContext` worldSize/worldOffset use live `Vector2` instances mutated in place

### Bug fixes

- `process.env` gate typed via module-local `declare const process` in all gating files — no `@types/node` required in browser-only consumers
- Bus worker resolved via extensionless URL so both source (`.ts`) and dist (`.js`) consumers find the correct sibling
- `readRenderTargetPixelsAsync` call fixed to match three.js r183 signature (no buffer argument)
- Debug registrations queued when they arrive before `DevtoolsProvider.start()` — no dropped registrations on fast mount
- Type-aware lint errors resolved throughout: unused imports dropped, `import type` conversions, proper error wrapping

`three-flatland` now ships a complete 2D lighting pipeline — signed SDF shadows, Forward+ tiled culling with per-category fill quotas, per-sprite shadow radii, and a full normal-map loader chain — alongside significant sprite performance improvements and a production-safe devtools dead-strip.

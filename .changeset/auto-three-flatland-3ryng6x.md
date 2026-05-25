---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## three-flatland

### New features

**2D Lighting system**
- `Light2D` — point, directional, ambient, and spot lights with `position`, `color`, `intensity`, `radius`, `castsShadow`, `importance`, and `category` fields
- `Light2D.castsShadow` (default `true`) — set `false` on cosmetic fill lights to skip the SDF trace for those lights; packed into the lights DataTexture for shader-side gating
- `Light2D.importance` (default `1.0`) — multiplicative tile-ranking bias; hero lights set higher resist eviction by dense fill clusters
- `Light2D.category?: string` — fill lights with the same category share an independent 2-slot tile quota (djb2-hashed bucket), preventing cross-type luminance interference
- `LightEffect` system — attach lighting effects to `Flatland` via `flatland.setLighting(effect)`; `LightEffectBuildContext` carries `sdfTexture`, `worldSizeNode`, `worldOffsetNode` for TSL shader construction
- `SDFGenerator` — JFA-based signed distance field (packed RGBA single-chain, same VRAM cost as unsigned); signed field (`sdf < 0`) enables clean self-shadow detection without magic escape offsets
- `OcclusionPass` — renders sprite/tile occluder silhouettes for SDF seeding; half-res default for performance; separable 5-tap binomial blur pass for smoother SDF transitions
- `ForwardPlusLighting` — tiled Forward+ light culling with hero/fill separation, per-category fill quotas, and tile-level compensation; CPU tile bounds aligned to shader's screen-pixel stride formula
- `shadowPipelineSystem` — ECS system that runs after `flushDirtyRangesSystem`; occluder-dirty gate skips the ~15-pass JFA/blur regen when occluders and camera are unchanged
- `Sprite2D.shadowRadius?: number` — per-sprite shadow escape radius; `undefined` = auto-derive from `max(|scale.x|, |scale.y|)`, updated every frame with `AnimatedSprite2D` frame swaps at no extra cost
- Per-sprite `castsShadow` bit and `readCastShadowFlag()` / `readShadowRadius()` TSL helpers

**Normal map loaders**
- `NormalMapLoader` — runtime "try baked → fall back to runtime TSL" loader; instance API (`extends Loader`) and static API with URL+options cache
- `normalDescriptor` — `NormalSourceDescriptor` type and loader for `.normal.json` sprite-region descriptor files
- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` updated with `normals: true | descriptor` option and `forceRuntime` probe bypass

**TSL instance attribute helpers**
- `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()` — typed TSL accessors for all named fields in the interleaved core instance buffer, re-exported from `three-flatland/lights`

**Devtools**
- `DebugTextureRegistry` — GPU buffer readback registry with `maxDim` cap per entry, lazy-allocated `Downsampler`, and end-of-frame readback timing
- `pixel-convert.ts` — worker-side RGBA8 conversion for `rgba8`, `r8`, `rgba16f`, `rgba32f` with display modes `colors`, `normalize`, `mono`, `signed`, `alpha`; GPU row-padding (WebGPU 256-byte alignment) detected and stripped
- `createDevtoolsProvider(opts?)` — helper for vanilla three.js apps; returns a live `DevtoolsProvider` or a no-op stub in production
- Debug registrations queued when they arrive before `DevtoolsProvider.start()` — fixes SDFGenerator/OcclusionPass constructors registering before first `render()`
- Lighting pipeline textures registered: `sdf.distanceField`, `occlusion.mask`, JFA intermediates, radiance cascade levels

**Observable refactor**
- `Sprite2D` tint/anchor now use `observable.color.attach` / `observable.vector2.attach` shared strategies (was ~100 lines of inline duplicate)

### Performance

- Devtools subsystem dead-stripped from production bundles via inlined `process.env.NODE_ENV` gate — eager bundle: 45.4 KB → 36.3 KB; `DevtoolsProvider` lazy-loaded via dynamic `import()`
- ECS perf-track instrumentation gated on dev-only (not `FL_DEVTOOLS`) — production demo builds no longer pay instrumentation overhead
- `writeShadowRadius` idempotent — skips buffer write and dirty-mark when scale is unchanged (static-scale scenes stop re-uploading the interleaved buffer every frame)
- `AnimatedSprite2D` `onFrame`/`onEvent` callbacks hoisted to bound instance fields — eliminates per-sprite per-frame arrow allocation in dense animated scenes
- Zero-alloc light-effect runtime context — `runtimeCtx` reuses a module-level scratch object; `LightingContext` defaults to live `Vector2`s mutated in place
- Chrome Performance-panel per-system ECS tracks with color coding and tooltip properties, gated behind the devtools fold

### Internal / architecture

- **Interleaved instance buffer**: core per-sprite data (UV, color, flip, system flags, enable bits, shadow radius) consolidated into a single `InstancedInterleavedBuffer` with four attribute views (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`) — collapses 3 vertex buffer bindings into 1, freeing 3 slots under WebGPU's `maxVertexBuffers=8` cap; `effectBuf0+` is now pure `MaterialEffect` data
- Per-instance TSL accessors moved to `materials/instanceAttributes.ts` (were `lights/wrapWithLightFlags.ts`)
- `EffectMaterial` throws a clear error when cumulative effect data would exceed `MAX_EFFECT_FLOATS = 12`
- `bus-worker` resolved via extensionless URL — works from source (`bus-worker.ts`) and dist (`bus-worker.js`) without bundler config

### Breaking changes

- `skipBakedProbe` renamed to `forceRuntime` on `SpriteSheetLoader`, `LDtkLoader`, and `TiledLoader` normal options — update call sites
- `disableRuntimeBake` removed from loader options; runtime bake is always the fallback — use `forceRuntime: true` to skip the probe
- `DEVTOOLS_BUNDLED` public re-export removed; use the inlined `process.env` gate
- `DirectLightEffect`, `SimpleLightEffect`, `RadianceLightEffect`, `AutoNormalProvider` removed (moved to follow-up PR)
- `LightEffectBuildContext` now includes `sdfTexture`, `worldSizeNode`, `worldOffsetNode` — custom effect implementations must accept the extended context

Delivers a complete 2D lighting pipeline — SDF shadows, Forward+ culling, normal maps, per-sprite shadow radii — alongside a production-safe devtools system and a slimmer instance buffer layout.

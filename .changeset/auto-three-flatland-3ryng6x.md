---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## New Features

### Lighting Pipeline
- Complete 2D lighting pipeline: `SDFGenerator` (JFA-based signed SDF), `ForwardPlusLighting` (tiled culling with hero/fill split and per-category quotas), `OcclusionPass`, `LightEffect` system with ECS traits, registry, and R3F attach helpers
- `Light2D` class: point, directional, ambient, and spot light types; `castsShadow`, `importance`, `category` fields
- `LightStore`: packs light data into a DataTexture for GPU shader consumption
- Signed SDF via packed RGBA JFA chain: inside/outside distances packed into a single ping-pong RT (same VRAM and pass count as the old unsigned generator); enables `sdf < 0` self-shadow detection
- SDF default resolution scale 0.5 (half-res); 5-tap separable binomial blur pass for smooth SDF transitions
- `shadowPipelineSystem` runs after transform sync (fixes one-frame shadow lag on moving casters); occluder-dirty gate driven by `BucketedDirtyTracker` — skips the full ~15-pass JFA/blur regen when occluders and camera are unchanged
- SDF regen now triggered by `OrthographicCamera.zoom` changes (zoom scales the projection without touching frustum bounds)
- `shadowFilter` (`auto|nearest|linear`) pushed from `DefaultLightEffect` to `SDFGenerator.setFilter` per frame
- `Light2D.castsShadow` packed into `LightStore` row3.b; per-light shadow-trace opt-out in shader
- `Light2D.importance` for tile-ranking bias; `Light2D.category` for independent per-category fill quotas
- Forward+ tile size 16 → 32 px (4× CPU-cull speedup at 1000+ lights)
- CPU tile bounds aligned with shader screen-pixel tile math (`tileWorldStride = TILE_SIZE / screenSize * worldSize`)

### Loaders
- `NormalDescriptorLoader` + `normalDescriptor.ts`: parses `.normal.json` sidecar files
- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` gain a `normals` option with `forceRuntime` flag; `resolveSheetNormals()` / `resolveTilesetNormals()` for auto normal-map resolution
- Loaders reorganized into `src/loaders/` (new) alongside the existing `src/tilemap/`
- `forceRuntime` replaces `skipBakedProbe` on all baked-asset loaders; `disableRuntimeBake` removed

### Instance Buffer
- Interleaved core instance buffer: UV, color, system flags, and extras packed into a single buffer (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`), freeing 3 WebGPU vertex buffer slots and eliminating a latent collision hazard with the effect-field allocator
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` (3 effectBufs × 4 floats); throws a clear error at `registerEffect` when the cap would be exceeded
- Per-sprite `Sprite2D.shadowRadius` (`undefined` = auto-derived from `max(|scale.x|, |scale.y|)`); auto-tracks scale changes including `AnimatedSprite2D` frame swaps
- New TSL instance-attribute helpers in `materials/instanceAttributes.ts`: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readShadowRadius()`, `readCastShadowFlag()`, `readReceiveShadowsFlag()`

### ECS & Systems
- `SystemSchedule.add()`/`prepend()` require `{ track, name }` labels; `run()` emits per-system Chrome DevTools Performance spans on color-coded tracks (behind `DEVTOOLS_BUNDLED`)
- `lightEffectSystem` zero-alloc: module-level scratch `runtimeCtx`, live `Vector2` defaults mutated in place each frame

### Debug
- `DevtoolsProvider` constructor is now side-effect-free; `start()`/`dispose()` lifecycle methods (start opens channels, announces, and starts flush timer)
- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` for vanilla Three.js apps
- Texture readback moved to `endFrame()` so visualizations capture a complete, consistent frame
- `DebugTextureRegistry`, `SubscriberRegistry`, `BusPool`, worker-side `pixel-convert.ts`

## Breaking Changes

- `BakedAssetLoaderOptions.skipBakedProbe` renamed to `forceRuntime`; `disableRuntimeBake` removed — runtime bake is always the fallback when normals are requested
- Internal instance buffer attribute names changed (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`); public API (`Sprite2D`, `addEffect`, TSL helpers) unchanged

## Bug Fixes

- Fixed bus-worker URL resolution for built `dist/` vs. source (dropped `.ts` extension from `new URL(...)`)
- Fixed `Flatland._validateLightingChannels` using `globalThis.process` so packages without `@types/node` typecheck cleanly
- Fixed tile light lookup texture (2D sampler path)

## Removals

- `RadianceCascades` removed from public exports (moved to follow-up PR)
- `AutoNormalProvider` removed from error messages, docs, and planning files
- Old `src/tilemap/LDtkLoader.ts` and `TiledLoader.ts` replaced by `src/loaders/` versions

This release ships the full 2D lighting pipeline — signed-SDF shadow casting, Forward+ tiled light culling with per-category fill quotas, and per-sprite shadow radius — alongside interleaved instance buffers and a production-ready debug texture inspector.


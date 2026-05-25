---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Full 2D lighting pipeline, interleaved instance buffer, normal-map loaders, and devtools for the lighting-stochastic-adoption branch.**

### 2D Lighting pipeline

- JFA-based signed SDF generation (packed dual-chain RGBA layout: outside seed in RG, inside seed in BA) — signed SDF at the same VRAM and pass cost as the previous unsigned generator
- Separable 5-tap binomial blur pass on the SDF for smoother shadow transitions
- `shadowFilter` option resolved per frame by `shadowPipelineSystem` and pushed to `SDFGenerator.setFilter` (`auto|nearest|linear`)
- Shadow pipeline moved to `append` phase so it runs after `conditionalTransformSyncSystem` + `flushDirtyRangesSystem` — occluder pre-pass sees freshly-uploaded matrices, fixing one-frame shadow lag on moving casters
- Occluder-dirty gate: `flushDirtyRangesSystem` tracks per-batch matrix/interleaved dirty state into `BatchRegistry.occludersDirty`; `shadowPipelineSystem` skips the occluder render and full JFA/blur chain when occluders and camera are unchanged
- `LightEffect` system with ECS traits, registry, and React attach helpers
- `LightEffectBuildContext` carries `sdfTexture`, `worldSizeNode`, `worldOffsetNode` so effect shaders bind stable TSL texture/uniform nodes at build time
- `SDFGenerator` eagerly allocates 1×1 placeholder RTs on construction — stable `sdfTexture` reference across resize

### Light2D

- `Light2D.castsShadow` (default `true`) — packs into `LightStore` row3.b for per-light shader gate
- `Light2D.importance` (default `1.0`) — multiplicative score bias; hero lights resist eviction by fill clusters
- `Light2D.category` (optional string) — djb2-hashed to a 2-bit fill bucket (0–3) at set-time; `LightStore` row3.a carries the bucket index; `ForwardPlusLighting` tracks per-tile per-category counters with independent 2-slot quota and compensation per bucket

### Per-sprite shadowRadius

- `Sprite2D.shadowRadius?: number` — `undefined` (default) auto-derives from `max(|scale.x|, |scale.y|)` each frame via `transformSyncSystem`; explicit override bypasses auto-resolve
- Radius preserved across `clone()`
- `readShadowRadius()` TSL helper reads the per-instance attribute in shaders

### Interleaved instance buffer

- Core per-instance data consolidated into a single `InstancedInterleavedBuffer` with four views: `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras` — collapses 3 vertex buffer bindings into 1, freeing 3 slots under WebGPU's `maxVertexBuffers=8` cap
- `effectBuf0+` is now pure `MaterialEffect` data with no reserved system slots; effect-slot allocator starts at offset 0
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` enforced at `registerEffect` time with a clear error instead of a WebGPU pipeline rejection at draw time
- TSL helpers moved to `materials/instanceAttributes.ts`: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readShadowRadius()`, `readCastShadowFlag()`; public re-exports unchanged

### Forward+ tiled culling

- TILE_SIZE bumped 16→32: ~4× fewer tiles at 1080p, proportional CPU tile-assignment speedup
- CPU tile-bounds now computed using the shader's screen-pixel stride (`tileWorldStride = TILE_SIZE / screenSize * worldSize`) — fixes fill-light checkerboard gaps caused by CPU/GPU tile-boundary mismatch
- Default SDF resolution scale set to 0.5 for performance
- Per-category fill quotas: 2 fills per bucket per tile, fills compete only within their own bucket

### Normal-map loader integration

- `normalDescriptor` loader: resolves `NormalSourceDescriptor` to URL/texture
- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` gain `normals: true | descriptor` option with the canonical baked-asset loader pattern (try baked probe → runtime `normalFromSprite` fallback + dev-time warning)
- `forceRuntime` flag unified across all loaders (was `skipBakedProbe` / `disableRuntimeBake`)
- `MaterialEffect` gains elevation channel support

### Devtools

- `createDevtoolsProvider(opts?)` — returns a live `DevtoolsProvider` or a no-op stub; enables devtools in vanilla apps without a `Flatland` instance
- `DevtoolsProvider` constructor is side-effect-free; explicit `start()` / `dispose()` lifecycle; `Flatland.render()` lazy-starts on first call
- Debug texture readback moved to `endFrame()` (consistent, fully-rendered frame content)
- Worker-side pixel format conversion (rgba8, r8, rgba16f, rgba32f), GPU row padding detection (256-byte `bytesPerRow` alignment)
- `bus-worker` URL resolved without extension — fixes production builds consuming dist/
- Per-system ECS perf tracks via `Performance.measure` with colored Chrome DevTools entries; all `add()`/`prepend()` sites require a `{track, name}` label

### Performance

- Zero-alloc frame context in `lightEffectSystem` — `runtimeCtx` hoisted to module scratch; `LightingContext.worldSize`/`worldOffset` default to live `Vector2` nodes mutated in place

### BREAKING CHANGES

- `skipBakedProbe` and `disableRuntimeBake` options removed from all loaders — use `forceRuntime: true`
- Interleaved instance buffer internal attribute names and offsets changed; public `Sprite2D` and `MaterialEffect` API unchanged
- `RadianceCascades` no longer exported from `three-flatland/lights` (moved to follow-up PR)
- `Flatland._debug` renamed to `_devtools` throughout

Delivers the complete 2D lighting pipeline including SDF soft shadows, signed SDF, per-sprite occluder radii, Forward+ fill quotas, normal-map loader integration, and a fully instrumented devtools foundation.

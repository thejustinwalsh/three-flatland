---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### 2D lighting pipeline

- New `Light2D` class with point, directional, ambient, and spot types
- `LightEffect` system with traits registry and R3F attach helpers (`useLightEffect`)
- `LightEffectBuildContext` carries `sdfTexture`, `worldSizeNode`, `worldOffsetNode` — effects bind these at shader-build time
- `Flatland.setLighting` eagerly mints `SDFGenerator` + `OcclusionPass` before calling `buildLightFn`; `shadowPipelineSystem` is idempotent
- World-bound `worldSizeNode` / `worldOffsetNode` uniforms updated each frame from camera bounds — zero-cost mutation
- New `NormalDescriptorLoader`: loads JSON sidecar normal-map descriptors for sprite sheets

### Forward+ tiled lighting

- `ForwardPlusLighting` tile stride bumped to 32px — 4× fewer tiles, 4× faster CPU assignment at high light counts
- Fixed tile world-space AABB calculation to match shader's screen-pixel stride (`TILE_SIZE / screenSize * worldSize`) — eliminates tile-boundary gaps in fill coverage
- Hero lights (`castsShadow: true`) bypass fill quota; fill lights capped at 2 per category per tile
- `LightStore.row3.b` carries per-light `castsShadow` flag; `row3.a` carries per-light category bucket index

### Per-light & per-sprite controls

- `Light2D.castsShadow?: boolean` — opt individual lights out of shadow casting; defaults `true`; preserved across `clone()`
- `Light2D.category?: string` — hashed bucket (0..3) for independent fill-light quotas per category
- `Light2D.importance?: number` — tile-ranking bias; high values prevent hero lights from being evicted
- `Sprite2D.shadowRadius?: number` — per-instance shadow escape radius; `undefined` = auto-resolved from `max(|scale.x|, |scale.y|)` each frame; preserved across `clone()`

### SDFGenerator

- Signed SDF via packed ping-pong JFA: single seed pass, single JFA chain, RGBA layout carries both outside/inside seed UVs — same VRAM and pass count as the previous unsigned generator
- Separable 5-tap binomial blur for smoother SDF edges
- Default resolution scale changed to 0.5 for performance
- Registered debug textures: `sdf.distanceField`, `sdf.jfaPing`, `sdf.jfaPong`; radiance cascade textures registered/unregistered on rebuild

### Instance buffer (internal, API-compatible)

- Core per-instance data consolidated into a single `InstancedInterleavedBuffer` with four attribute views: `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras` (64 bytes/16 floats per instance)
- `effectBuf0+` is now pure effect data with no reserved system slots; effect-slot allocator starts at offset 0
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` cap with a clear error at `registerEffect` time instead of a silent GPU pipeline rejection
- Freed 3 vertex buffer slots (was at WebGPU `maxVertexBuffers=8` cap)

### TSL instance attribute helpers (new exports)

- `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readCastShadowFlag()`, `readShadowRadius()` — typed TSL helpers for all named fields in the interleaved core buffer
- Moved to `materials/instanceAttributes` alongside `effectFlagBits`; re-exported from `three-flatland/lights`

### Debug infrastructure

- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` — returns active provider or no-op stub; safe for non-Flatland vanilla apps
- `DebugTextureRegistry`: GPU readback (one in-flight per entry); readbacks fire end-of-frame after all render passes
- `BatchCollector`: collects per-frame draw-call and sprite batch data for the devtools batches panel
- `StatsCollector`, `perf-track`, `pixel-convert` worker module for format conversion
- `DevtoolsProvider` constructor is now side-effect-free; `start()` / `dispose()` explicit lifecycle

### Fixes

- `OcclusionPass`: lights culled by bounding radius before shadow render; default resolution 0.5×
- Tilemap loaders (`LDtkLoader`, `TiledLoader`) updated for revised type definitions

This release delivers the complete 2D lighting pipeline — SDF shadow tracing, Forward+ tiled culling, per-light and per-sprite shadow control — integrated with Flatland's ECS and the devtools debug infrastructure.
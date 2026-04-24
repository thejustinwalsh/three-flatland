---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### 2D lighting system

- `Light2D` class with point, directional, ambient, and spot types; `enabled` and `castsShadow` flags
- `LightStore` DataTexture backing; `castsShadow` packed into row3.b for shader consumption
- `LightEffect` system: `buildLightFn` pattern, `LightEffectBuildContext` with `sdfTexture`, `worldSizeNode`, `worldOffsetNode`
- `ForwardPlusLighting`: tiled light culling with SDF occlusion; default resolution scale 0.5; lights culled per tile
- `SDFGenerator`: JFA-based SDF with packed RGBA ping-pong chain carrying both outside and inside seed UVs — signed SDF at the same VRAM and pass count as the original unsigned generator
- `OcclusionPass`: renders occluder silhouette; 5-tap separable binomial blur for smoother SDF transitions
- Shadow pipeline ECS system (`shadowPipelineSystem`) with post-process integration
- `wrapWithLightFlags`: `readCastShadowFlag()`, `readShadowRadius()` TSL attribute helpers
- Coordinate utilities (`coordUtils.ts`) for world↔UV conversion
- `RadianceCascades` GI scaffolding (WIP)

### Per-sprite shadowRadius

- `Sprite2D.shadowRadius?: number` — `undefined` (default) auto-resolves to `max(|scale.x|, |scale.y|)` each frame, tracking AnimatedSprite2D frame-source-size swaps automatically
- Explicit override preserved across `clone()`; setter round-trip back to `undefined` restores auto-resolve
- `transformSyncSystem` writes radius per-frame with zero extra sync cost
- `TileLayer` writes tile radius from tile size

### Interleaved instance buffer

- Core per-instance data moved to a single `InstancedInterleavedBuffer` with four views: `instanceUV` (offset 0), `instanceColor` (offset 4), `instanceSystem` (offset 8), `instanceExtras` (offset 12, holds shadowRadius)
- Collapses 3 vertex buffer bindings into 1, freeing 3 slots within WebGPU's `maxVertexBuffers=8` cap
- `effectBuf0+` is now pure `MaterialEffect` data with no reserved system slots; effect-slot allocator starts at offset 0
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` (3 effectBufs × 4 floats); throws a clear error at `registerEffect` on overflow instead of failing at GPU pipeline creation
- Public API unchanged: `Sprite2D.shadowRadius`, `castsShadow`, `addEffect()` all behave identically

### Normal descriptor loader

- `normalDescriptor.ts`: loads `.normal.json` sidecar files mapping sprite regions to baked normal-map URLs
- `MaterialEffect` gains elevation channel support; `channels.ts` updated
- `LDtkLoader`, `SpriteSheetLoader`, `TiledLoader` updated to propagate normal descriptor URLs
- `Sprite2D` types extended with normal descriptor field

### Debug infrastructure

- `DebugTextureRegistry`: GPU buffer readback pipeline; `RenderTarget` paths use `readRenderTargetPixelsAsync`, one in-flight per entry; live dimensions read at drain time; version bump on resize
- `DebugRegistry` for CPU typed-array publication via `registerDebugArray` / `touchDebugArray`
- `debug-sink.ts` queues registrations that arrive before `DevtoolsProvider.start()` and replays on activation
- `DevtoolsProvider` pure constructor; explicit `start()`/`dispose()` lifecycle; lazy-starts on first `Flatland.render()` call
- `createDevtoolsProvider(opts?)` factory exported from `three-flatland` for non-Flatland vanilla apps
- `BusTransport` + pool-buffer architecture: zero-alloc flush path on render thread; large pool tier raised to 2 MB
- Readbacks fire from `endFrame()` after all passes complete
- `StatsCollector` GPU query throttled to 10 Hz

### Tilemap and loaders

- `LDtkLoader` / `TiledLoader` updated for new tilemap type shapes; unused legacy providers removed
- `TileLayer` writes per-tile shadow radius and system flags into the interleaved buffer
- `LDtkLoader` tilemap type updated (`tilemap/types.ts`)

### Fixes and performance

- `ForwardPlusLighting` tiles lighting lookup corrected for 2D texture path
- Ambient contribution pipeline fixed in lighting integration
- `Flatland._validateLightingChannels` uses `globalThis.process` for compatibility with packages without `@types/node`
- Renamed `Flatland._debug` → `_devtools` throughout

The lighting pipeline is now fully integrated end-to-end: ECS wires lights and effects, SDF generates per-frame signed distance, ForwardPlus culls lights per tile, and shadow traces consume the signed SDF for correct soft shadows with per-sprite self-shadow escape.

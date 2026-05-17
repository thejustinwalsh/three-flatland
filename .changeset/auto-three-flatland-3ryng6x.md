---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting pipeline**
- `Light2D` — point, directional, ambient, and spot light types; `castsShadow` flag (default `true`) packed into `LightStore` row 3 for shader consumption; `importance` bias for Forward+ ranking; `category?: string` for per-bucket fill quotas; all fields preserved across `clone()`
- `ForwardPlusLighting` — tiled light culling; CPU tile-bounds math aligned with shader `floor(screenPos / TILE_SIZE)` stride; `TILE_SIZE` 16 → 32 (4× fewer CPU tiles); per-category fill-light quotas (2 slots per bucket); tile storage stride=8 with 4-bucket `fillScale` compensation in the meta texel
- `SDFGenerator` — JFA-based signed SDF packed into a single ping-pong chain (RGBA layout: R/G = outer seed, B/A = inner seed); same RT/pass cost as unsigned; 5-tap separable binomial blur for smoother SDF transitions; `sdf.distanceField` and JFA intermediate buffers published as debug textures
- `OcclusionPass` — occlusion silhouette at configurable resolution scale (default 0.5×); `occlusion.mask` registered as a debug texture
- `LightEffect` / `LightStore` — `LightEffectBuildContext` carries stable `sdfTexture`, `worldSizeNode`, `worldOffsetNode` references for effect shaders; `Flatland.setLighting` eagerly allocates `SDFGenerator` + `OcclusionPass` before `buildLightFn` so texture references are stable at shader build time
- Shadow pipeline integrated into ECS post-process pass via `shadowPipelineSystem`

**Instance buffer**
- Core instance data interleaved into `InstancedInterleavedBuffer` (64 bytes / 16 floats): `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras` — frees 3 of WebGPU's 8 vertex-buffer slots for `effectBuf` growth
- `EffectMaterial.MAX_EFFECT_FLOATS = 12`; clear error at `registerEffect` if cap exceeded (instead of silent GPU pipeline failure at draw time)
- TSL instance-attribute helpers (`readFlip`, `readSystemFlags`, `readEnableBits`, `readLitFlag`, `readShadowRadius`, `readReceiveShadowsFlag`, `readCastShadowFlag`) consolidated in `materials/instanceAttributes.ts`; re-exported from `three-flatland/lights` barrel for back-compat

**Per-sprite shadow radius**
- `Sprite2D.shadowRadius?: number` — auto-derived from `max(|scale.x|, |scale.y|)` each frame; explicit override for sprites with transparent padding; preserved across `clone()`
- `readShadowRadius()` TSL helper for shader consumption; packed into `effectBuf0.z` to stay under WebGPU's 8-buffer vertex cap

**Loaders**
- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` — `forceRuntime: true` replaces `skipBakedProbe` (unified with `SlugFontLoader` pattern); `disableRuntimeBake` removed
- `normalDescriptor` loader for `.normal.json` sidecar files; normal descriptor support added to sprite types and `MaterialEffect` channels
- `MaterialEffect` elevation channel support

**Debug / devtools**
- `DevtoolsProvider` constructor side-effect-free; explicit `start()` / `dispose()` lifecycle (idempotent); `Flatland.render()` lazy-starts on first call
- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` for non-Flatland vanilla consumers
- `DebugTextureRegistry` with per-entry `maxDim` cap and lazy GPU downsampler; texture readback moved to `endFrame()` for consistent frame captures
- `pixel-convert.ts` worker-side pixel format conversion for `rgba8`, `r8`, `rgba16f`, `rgba32f`; GPU `bytesPerRow` 256-byte padding handled correctly
- `perf-track.ts`: `perfMeasure` / `perfStart` emit User Timing spans on Chrome's custom-track extension
- `SubscriberRegistry` per-consumer buffer selection with cached union; `BufferDisplayMode` per-entry display hints
- `LightStore.lightsTexture` → `lightStore.lights`; `ForwardPlusLighting._tileTexture` → `forwardPlus.tiles` as debug textures
- Bus worker URL resolved without extension so bundlers emit the correct sibling for source vs dist consumption

**Cleanup**
- `RadianceCascades`, `AutoNormalProvider`, and unused tilemap stubs removed from exports
- `Flatland._debug` renamed to `_devtools` throughout

This release lands the full 2D lighting pipeline — SDF shadows, Forward+ tiled culling, normal maps via baked sidecars or runtime TSL fallback — along with the interleaved instance buffer and a production-ready devtools debug texture stream.

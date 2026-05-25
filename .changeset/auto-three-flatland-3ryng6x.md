---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Lighting system**

- `Light2D`: point, directional, ambient, and spot light types; `castsShadow`, `importance`, `category` fields
  - `castsShadow` per-light shadow opt-out packed into LightStore row3.b for shader consumption
  - `importance` multiplicative tile-ranking bias (hero torches set to 10 to resist fill eviction)
  - `category` string hashed (djb2, cached) to an independent 2-slot fill bucket per category; cross-category competition eliminated
- `SDFGenerator`: JFA-based signed SDF via packed ping-pong RGBA layout (outside+inside seed UVs in a single chain); same VRAM cost as unsigned
  - `setFilter()` exposes SDF + blur RT sampling as `nearest` or `linear` (JFA ping-pong stays nearest)
  - 5-tap separable binomial blur pass for smoother SDF transitions
  - `sdf.distanceField` and `occlusion.mask` debug textures registered for devtools inspection
- `OcclusionPass`: occluder silhouette render with elevation-aware occlusion
- `ForwardPlusLighting`: tiled Forward+ light culling
  - Tile size bumped 16 → 32 for 4× CPU cull speedup at 1080p
  - CPU tile bounds aligned with shader screen-pixel stride math (fixes checkerboard gaps in fill coverage)
  - Per-category fill quotas: hero lights bypass dedup; fills capped at 2 per bucket per tile
- `shadowPipelineSystem` moved to append phase (fixes one-frame shadow lag on moving casters)
- Occluder dirty gate: skip JFA/blur regen when occluders and camera frustum/position/zoom are unchanged
- Fixed: SDF not regenerating on `OrthographicCamera.zoom` change (zoom added to dirty check)
- Per-sprite `shadowRadius` auto-derived from scale; `DefaultLightEffect.shadowStartOffsetScale` multiplier
- `LightEffect` system with traits, registry, and `attach` helpers for R3F integration

**Instance buffer**

- Core per-instance data interleaved into a single buffer (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`) — frees 3 of WebGPU's 8 `maxVertexBuffers` slots
- Effect-slot allocator starts at offset 0; `EffectMaterial.MAX_EFFECT_FLOATS = 12`; overflow throws a clear error at registration time
- TSL accessor helpers: `readFlip`, `readSystemFlags`, `readEnableBits`, `readLitFlag`, `readShadowRadius`, `readCastShadowFlag`, `readReceiveShadowsFlag`
- Accessors moved to `materials/instanceAttributes.ts`; `lights/` barrel retains only `wrapWithLightFlags`

**Loaders**

- `normalDescriptor` loader: parses `.normal.json` per-region sprite descriptors
- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`: `normals: true | descriptor` option triggers baked-first normal-map resolution
- `forceRuntime` opt-out (renamed from `skipBakedProbe`) on all three loaders
- `MaterialEffect` gains elevation channel support

**Observable / Sprite2D**

- `Sprite2D` tint and anchor properties now delegate to shared `observable.color/vector2` strategies; removes ~100 lines of inline duplicate

**DevtoolsProvider**

- Pure constructor, explicit `start()`/`dispose()` lifecycle; safe for R3F speculative construction
- `<DevtoolsProvider />` React component for non-Flatland scenes; `createDevtoolsProvider()` helper for vanilla
- Debug bus worker URL changed to extensionless (fixes production `dist/` build)
- Per-flush CPU span and bus-receive latency spans emitted as Chrome User Timing marks
- `ECS SystemSchedule` `add()`/`prepend()` require `{track, name}` label; per-system spans with tooltip properties on the `ecs:run` track
- Force-keyframe fix on buffer switch in VP9 stream mode
- Zero-alloc light-effect runtime context: hoisted scratch object, live `Vector2` defaults for worldSize/worldOffset

**BREAKING CHANGES**

- `skipBakedProbe` renamed to `forceRuntime` in `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` loader options
- `DirectLightEffect`, `SimpleLightEffect`, `RadianceLightEffect` removed from `@three-flatland/presets` (moved to follow-up PR)
- `AutoNormalProvider` removed; use `NormalMapProvider` with the `normals` option on sprite/tilemap loaders

Major release delivering the full 2D lighting pipeline: signed SDF shadows, Forward+ tiled culling, per-sprite shadow radii, interleaved instance buffers, and unified normal-map loader integration.

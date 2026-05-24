---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### 2D lighting system

- Full JFA-based 2D lighting pipeline: `SDFGenerator` (signed distance field), `OcclusionPass`, `ForwardPlusLighting`, `LightEffect` system, and `shadowPipelineSystem` wired into the ECS schedule
- `Light2D` — point, directional, ambient, and spot light types; `castsShadow`, `category`, `importance` fields
- `LightStore` packs light data into a RGBA32F DataTexture; `castsShadow` packed into row3.b, category bucket into row3.a
- `LightEffect` / `LightEffectBuildContext` — plugin system for custom lighting shaders; effects declare `needsShadows` to opt into the SDF pipeline
- `shadowPipelineSystem` moved to append phase (after `conditionalTransformSyncSystem` + `flushDirtyRangesSystem`) — occluder pre-pass now sees freshly-uploaded matrices, fixing a one-frame shadow lag on moving casters
- SDF dirty gate: `shadowPipelineSystem` skips the `~15`-pass JFA/blur regen when occluders and camera are unchanged (automatic in manual-invalidate scenes)
- `Flatland.setLighting` eagerly allocates `SDFGenerator` + `OcclusionPass` before `buildLightFn` so the `sdfTexture` reference is stable at shader build time

### SDFGenerator

- Produces a signed distance field via a packed RGBA JFA chain: RG = nearest-occluder seed UV, BA = nearest-empty-space seed UV; one seed pass, one JFA chain, one final pass — same VRAM and pass count as the previous unsigned generator
- 5-tap separable binomial blur post-process for smoother SDF transitions
- `setFilter` method: retargets SDF + blur RT sampling (nearest or linear); JFA ping-pong stays nearest
- SDF and JFA debug textures registered for devtools inspection
- Texture readback moved to `endFrame()` for consistent frame capture

### Per-sprite shadow radius

- `Sprite2D.shadowRadius?: number` — `undefined` (default) auto-derives from `max(|scale.x|, |scale.y|)` each frame; explicit value overrides (useful for sprites with transparent padding)
- `transformSyncSystem` resolves per-frame; tracks `AnimatedSprite2D` frame-source-size changes at no extra sync cost
- `readShadowRadius()` TSL helper reads the per-instance attribute in shaders
- Preserved across `clone()`

### Instance buffer layout

- Core per-instance data consolidated into a single `InstancedInterleavedBuffer` with four attribute views: `instanceUV` (offset 0), `instanceColor` (4), `instanceSystem` (8), `instanceExtras` (12); frees 3 vertex buffer slots previously consumed by separate UV/color/flip buffers
- Effect-slot allocator starts at offset 0 (was colliding with system-reserved slots); `EffectMaterial.MAX_EFFECT_FLOATS = 12` enforced at `registerEffect` time with a clear error
- Public API unchanged: `Sprite2D.shadowRadius`, `castsShadow`, `readCastShadowFlag()`, `readShadowRadius()`, `addEffect()` all work identically

### TSL instance attribute helpers

- `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()` added alongside existing `readShadowRadius()`, `readCastShadowFlag()`, `readReceiveShadowsFlag()`, `wrapWithLightFlags()`
- All helpers moved to `materials/instanceAttributes.ts`; re-exported from the `three-flatland/lights` barrel (public API unchanged)
- `NormalSourceDescriptor` loader, `normalDescriptor.ts` — parses `.normal.json` sidecar files linking sprite sheets to baked normal maps

### Loaders

- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` gain a `normals` option accepting `true | NormalSourceDescriptor`; internally routes through `resolveNormalMap` for baked-probe → runtime fallback
- `forceRuntime: boolean` on all three loaders (replaces `skipBakedProbe` / `disableRuntimeBake`)
- Tilemap types updated; dead `TiledLoader`/`LDtkLoader` at `src/tilemap/` path replaced by canonical `src/loaders/` exports

### DevtoolsProvider

- Constructor is now side-effect-free; `start()` / `dispose()` manage `BroadcastChannel`, worker, and flush timer (both idempotent, multi-cycle)
- `Flatland.render()` lazy-starts on first call
- `createDevtoolsProvider(opts?)` helper for vanilla Three.js apps that don't construct a `Flatland` (`beginFrame`/`endFrame` are no-ops when devtools is inactive; terser strips the calls in prod)
- `<DevtoolsProvider />` R3F component exported from `three-flatland`
- `_debug` renamed to `_devtools` throughout

### Performance

- ForwardPlusLighting tile stride bumped 16 → 32 px: 4× fewer tiles at 1920×1080, O(lights × tiles/light) CPU cost drops proportionally
- Zero-alloc light-effect runtime context: `runtimeCtx` object hoisted to module scope; `LightingContext.worldSize`/`worldOffset` default to live `Vector2`s mutated in place
- Dead `fillScale`/tile-meta compensation pass removed from `ForwardPlusLighting` (was writing meta texels nothing consumed)
- OcclusionPass default resolution scale set to 0.5; lights culled before rasterization

### Bisect / removed

- `RadianceCascades` moved to a follow-up PR
- `AutoNormalProvider` removed (was never implemented)
- Unused `src/tilemap/LDtkLoader.ts` and `src/tilemap/TiledLoader.ts` paths removed; canonical paths are `src/loaders/`

### Fixes

- `bus-worker.ts` URL uses extensionless import to resolve correctly from both source and built-dist
- CPU tile-bounds use the same stride as the shader (`TILE_SIZE / screenSize * worldSize`) — fixes checkerboard fill gaps at non-multiple viewport sizes
- `Flatland._validateLightingChannels` uses `globalThis.process` for packages without `@types/node`
- Type-only lint fixes throughout (unused vars/imports, `import type`, correct `Array<T>` annotations)
- `LinearFilter` in `SDFGenerator` switched to type-only import

Introduces a complete 2D SDF-based lighting pipeline — signed distance field generation, Forward+ tiled culling, per-sprite shadow radii, per-category fill-light quotas — integrated into the ECS with zero per-frame allocation on the hot path.

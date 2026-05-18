---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Changes

**Loaders**
- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`: `normals.skipBakedProbe` renamed to `normals.forceRuntime`; `normals.disableRuntimeBake` removed — `forceRuntime: true` covers both opt-outs
- New `normalDescriptor` loader module with `NormalSourceDescriptor` type; used by all three loaders when resolving normal maps
- All three loaders expose `forceRuntime` on their normals option type and instance field, propagated through `resolveSheetNormals` / `resolveTilesetNormals` to `resolveNormalMap`

**Instance buffer layout** (internal — public API unchanged)
- Core per-instance data (UV, color, flip, system flags, enable bits, shadow radius, reserved extras) consolidated into a single `InstancedInterleavedBuffer` with four attribute views: `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`
- Frees 3 WebGPU vertex buffer slots previously used by separate `instanceUV`/`instanceColor`/`instanceFlip` buffers; `SpriteBatch` no longer sits at the `maxVertexBuffers=8` cap
- Effect-slot allocator starts at offset 0; `EffectMaterial.MAX_EFFECT_FLOATS = 12`; clear error thrown at `registerEffect` when cap would be exceeded

**Per-instance attributes**
- `Sprite2D.shadowRadius?: number` — explicit override for shadow escape distance; `undefined` (default) auto-derives from `max(|scale.x|, |scale.y|)` each frame; preserved across `clone()`
- TSL helpers: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readShadowRadius()`, `readCastShadowFlag()`, `readReceiveShadowsFlag()` — all re-exported from the `three-flatland/lights` barrel; internal raw `attribute(...)` reads migrated to use them

**Lights**
- `Light2D.castsShadow?: boolean` (default `true`) — per-light shadow opt-out; stored in lights DataTexture row 3 column B; read by `DefaultLightEffect` to gate the SDF trace
- `Light2D.importance: number` (default 1.0) — tile-assignment priority multiplier
- `Light2D.category?: string` — hashed to a 2-bit fill-bucket index; independent fill quota and compensation per category; `clone()` preserves the value

**LightEffect system**
- `LightEffect` + `LightStore` + `LightingSystem` architecture; `ForwardPlusLighting` with JFA-based SDF occlusion; `Light2D` point/directional/ambient/spot types
- `LightEffectBuildContext` extended with `sdfTexture`, `worldSizeNode`, `worldOffsetNode` so effect shaders can bind the SDF texture at build time
- `RadianceCascades` removed from main exports (moved to follow-up PR)

**Debug / devtools**
- `DevtoolsProvider` constructor is now side-effect-free; `start()` / `dispose()` lifecycle; `Flatland.render()` lazy-starts on first call
- `createDevtoolsProvider(opts?)` exported from `three-flatland` — returns a live provider or a no-op stub (production-safe)
- Debug protocol extended: buffer subscriptions, effect field location, `BatchCollector`
- `DevtoolsProvider` renamed internal field `_debug` → `_devtools`
- Bus worker URL resolved extensionless (`./bus-worker` without `.ts`) so both source and built dist resolve correctly

**Performance**
- SDF resolution defaults to 0.5× screen size
- `ForwardPlusLighting.TILE_SIZE` 16 → 32 px (4× fewer CPU tiles); CPU and shader tile boundaries now use the same stride formula
- `OcclusionPass` culls lights before rasterisation

**Bug fixes**
- `Sprite2D.shadowRadius` vec2 attribute (`.x` used, `.y` reserved) — single-component attributes don't bind reliably in TSL/WebGPU
- `Flatland._validateLightingChannels` uses `globalThis.process` for compatibility with packages that don't declare `@types/node`
- `StatsCollector` + `EnvCollector` updated for GPU timing detection

## BREAKING CHANGES

- `normals.skipBakedProbe` → `normals.forceRuntime` in `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` normals options
- `normals.disableRuntimeBake` removed — use `normals.forceRuntime: true`
- `Light2D.castsShadow` defaults to `true`; explicitly mark cosmetic lights with `castsShadow: false` to skip shadow tracing
- Instance buffer attribute names changed internally (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`); custom shaders reading raw attribute names must update

Delivers the complete 2D lighting pipeline — Forward+ tiled culling, JFA signed SDF shadows, per-sprite shadow radii, per-light category fill quotas — alongside a unified normal-map loader integration and a hardened devtools transport.

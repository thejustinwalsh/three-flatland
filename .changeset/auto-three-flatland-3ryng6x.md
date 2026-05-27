---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

### 2D Lighting System

- New `Light2D` class with point, ambient, and spot types; `castsShadow`, `importance`, and `category` properties
- Forward+ tiled light culling: CPU tile bounds now aligned with shader screen-pixel stride math, fixing fill-light checkerboard gaps in non-power-of-two viewports
- JFA-based signed SDF for shadow occlusion: two JFA chains (outside + inside distance) combined as `distOutside - distInside`; self-shadow uses clean `sdf < 0`
- Occluder-dirty gate: shadow pipeline skips SDF regen when occluders and camera (position, frustum, zoom) are unchanged
- Shadow pipeline runs after transform sync — no one-frame lag on moving casters
- `shadowFilter` option (`auto|nearest|linear`) on `SDFGenerator`; auto ties to `shadowPixelSnapEnabled`
- `OrthographicCamera.zoom` changes now trigger SDF regen (was skipped, freezing shadows on zoom)
- Fill-light quota system: `castsShadow: false` lights capped at 2 per tile per category with luminance compensation via `fillScale`
- `Light2D.category` (djb2 hash, 4 buckets): independent quota and compensation per fill category, preventing cross-type eviction
- `Light2D.importance` (default 1.0): multiplicative bias for tile-slot ranking; hero lights resist eviction by dense cosmetic fill clusters
- Dead per-tile `fillScale` shader multiply removed (was causing tile-boundary banding)
- `LightEffect` system with ECS traits, attach helpers, and React integration
- `NormalMapProvider` as the channel provider for normal maps

### Normal Map Pipeline

- `normalDescriptor.ts` loader + `NormalSourceDescriptor` type added to the loaders barrel
- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` support `normals: true | descriptor` and `forceRuntime: true`
- Loaders fall back to runtime TSL `normalFromSprite` when no baked sidecar is found; devtime warning fires at most once per URL

### Per-instance Data / ECS

- Core instance data (UV, color, flip, system flags, shadow radius, extras) interleaved in a single buffer (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`); frees 3 WebGPU vertex buffer slots previously at the 8-binding cap
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` cap enforced at `registerEffect` time with a clear error instead of a silent WebGPU pipeline rejection
- Per-sprite `shadowRadius` attribute: auto-derived from `max(|scale.x|, |scale.y|)`, overridable per-sprite; `transformSyncSystem` resolves it every frame tracking scale changes
- New TSL helpers: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readShadowRadius()`
- `Sprite2D.tint`/`anchor` delegate to shared `observable.color`/`vector2` strategies (removes ~100 lines of inline duplicate)

### Performance

- ECS perf-track instrumentation gated dev-only; examples built in `production + FL_DEVTOOLS=true` no longer pay the per-frame measurement cost
- `writeShadowRadius` idempotent: skips upload and dirty-mark when scale is unchanged in static-scale scenes
- `AnimatedSprite2D` callback closures hoisted to bound instance fields — no per-frame allocation in dense animated scenes
- Zero-alloc light-effect runtime context: module-level scratch object + live `Vector2` mutations
- 256 KB medium pool tier for devtools stats packets; eliminates mark-compact GC spikes with dashboard active (p99 frame time 23.5 ms → 10.1 ms at 16k–20k sprites)
- Devtools subsystem dead-stripped from production builds via inlined `process.env` gate; bundle: 45.4 KB → 36.3 KB
- ECS schedule fully instrumented with colored Chrome Performance-panel tracks (dev/`FL_DEVTOOLS` only)
- Shadow trace gated on per-light `castsShadow` flag — trace cost is O(casting lights) in dense fill scenes
- Shadow trace skipped when attenuation ≤ 0.01 — free savings in near-miss contributions

### Devtools / Debug

- `DevtoolsProvider` enables/disables GPU timestamp queries live off the stats subscription; fixes "Maximum number of queries exceeded" production regression from always-on query polling
- Devtools bus worker resolves via extensionless URL — works from both `source` and `dist` consumers
- Buffer subscription and effect field location added to the debug protocol

### Fixes

- `process.env.NODE_ENV`/`FL_DEVTOOLS` typed via module-local `declare const process` — no `@types/node` dependency for browser consumers
- `LinearFilter` imported as type-only in `SDFGenerator`
- Type-aware lint fixes across debug, loaders, and tilemap code

## BREAKING CHANGES

- `skipBakedProbe` renamed to `forceRuntime` on `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` normals options
- `disableRuntimeBake` removed; use `forceRuntime: true` instead
- `DEVTOOLS_BUNDLED` constant no longer exported from `three-flatland`; use the inlined `process.env.FL_DEVTOOLS` gate
- `RadianceCascades` no longer exported from `three-flatland/lights` (deferred to a follow-up PR)
- Internal instance buffer layout changed (`instanceUV`/`instanceColor`/`instanceSystem`/`instanceExtras`); public `Sprite2D` API is unchanged

Delivers a complete 2D lighting pipeline with SDF shadows, Forward+ culling, normal-map baking, and production-safe devtools dead-stripping.

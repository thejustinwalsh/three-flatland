---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting pipeline, normal map loaders, interleaved instance buffers, and Forward+ improvements.**

**2D lighting system**
- `Light2D` class: point, ambient, spot, and directional light types with `castsShadow`, `importance`, and `category` fields
- `LightStore`: packs light data into a DataTexture; `castsShadow` in row3.b, fill category bucket in row3.a
- `ForwardPlusLighting`: tile-based light culling with corrected CPU/shader tile boundary math (CPU now uses `TILE_SIZE / screenSize * worldSize` stride to match GPU); TILE_SIZE bumped 16 → 32 px for 4x CPU speedup
- `SDFGenerator`: signed SDF via a packed RGBA ping-pong JFA chain (both inside/outside distances in one pass — same VRAM cost as the previous unsigned generator); debug buffer names restored to `sdf.jfaPing` / `sdf.jfaPong`
- `OcclusionPass`: elevation-aware occlusion; default resolution scale changed to 0.5 for performance; lights outside frustum culled before the pass
- `LightEffect` / `LightStore` / `LightingSystem`: ECS integration with shadow pipeline system
- `Light2D.castsShadow` packed into LightStore and read per-frame by `DefaultLightEffect` to skip shadow traces for fill lights

**Per-sprite shadow radius**
- `Sprite2D.shadowRadius?: number` — auto-derived from `max(|scale.x|, |scale.y|)` each frame; override for sprites with transparent padding
- `readShadowRadius()` TSL helper reads the per-instance radius in shaders
- `shadowStartOffsetScale` (effect-level multiplier) replaces the scene-wide `shadowStartOffset` uniform

**Interleaved instance buffer**
- Core per-instance data (UV, color, flip, system flags, enable bits, shadow radius, extras) merged into a single 64-byte `InstancedInterleavedBuffer` with four attribute views: `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`
- Frees 3 of 8 WebGPU vertex buffer slots previously saturated by separate UV/Color/Flip buffers
- `effectBuf0+` is now pure `MaterialEffect` data with no reserved system slots; effect allocator starts at offset 0
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` enforced at `registerEffect` time with a clear error instead of a silent GPU pipeline rejection

**Per-instance TSL accessors** (`materials/instanceAttributes.ts`)
- `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readReceiveShadowsFlag()`, `readCastShadowFlag()`, `readShadowRadius()`
- All re-exported from `three-flatland/lights`; internal attribute name refactoring is isolated to one file

**Normal map loading**
- `NormalDescriptor` / `normalDescriptor.ts`: descriptor type for sourcing normal maps from baked PNG sidecars
- `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`: `normals: true | NormalDescriptor` option; auto-bakes via `resolveNormalMap` when sidecars are missing
- `forceRuntime: true` replaces `skipBakedProbe` across all loaders; `disableRuntimeBake` dropped

**Debug / devtools**
- `DevtoolsProvider`: emits GPU timing capability detection; sends environment info to dashboard
- `StatsCollector`: bucketed axis range for stable sparklines
- `DebugTextureRegistry`: debug buffers for SDF, occlusion mask, normal maps streamable to the devtools dashboard
- `bus-transport.ts`: extensionless `new URL(./bus-worker, ...)` fixes production build where only `.js` exists

**Bug fixes and type hygiene**
- Unused vars/imports removed; `import type` used consistently; IndexedDB rejections wrapped in `Error`; `void`-wrapped async Vite middleware; `PingPayload` changed from empty interface to `Record<string, never>`; `JSON.parse` result typed as `unknown`
- `Flatland._validateLightingChannels` uses `globalThis.process` so packages without `@types/node` typecheck cleanly

This release ships a complete, ECS-integrated 2D lighting pipeline with signed SDF shadows, per-sprite caster radii, interleaved instance buffers, and a normal-map loader surface compatible with the `flatland-bake` offline workflow.

---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D Lighting Pipeline:**
- `Light2D` class with point, directional, ambient, and spot light types
- `LightingSystem` with pluggable strategy pattern (Simple/Direct/Radiance)
- `LightEffect` system with ECS traits, registry, and `setLighting(effect)` API on `Flatland`
- `ForwardPlusLighting`: tiled light culling with reservoir-based overflow by importance score — graceful degradation instead of silent first-16-wins drop
- `SDFGenerator`: JFA-based signed-distance field generator for shadow occlusion
- `OcclusionPass`: offscreen pre-pass rendering shadow silhouettes at configurable scale (default 0.5×)
- React `attach` helpers for connecting lights and effects to the R3F scene graph

**Shadow System:**
- Per-sprite `castsShadow` flag (bit 2 of `effectBuf0.x`); zero-rebuild bit-flip setter
- `OcclusionPass` masks per-instance alpha by `castsShadow` attribute, allowing non-casters to contribute zero to the SDF seed
- Shadow pipeline promoted to `ShadowPipeline` ECS trait + `shadowPipelineSystem`; six private `Flatland` fields replaced by an O(1) cached query lookup
- `sdfTexture`, `worldSizeNode`, `worldOffsetNode` threaded through `LightEffectBuildContext`; non-shadow effects compile out the shadow path entirely (no GPU branch, no wasted uniform slot)
- `Flatland.setLighting` eagerly allocates `SDFGenerator` + `OcclusionPass` before calling `buildLightFn` so TSL `texture()` bindings captured at shader-build time remain stable across resize

**MaterialEffect:**
- `createMaterialEffect` is now generic over the `provides` tuple; `channelNode` return type constrained to the declared channel's node type — mismatched types fail at compile time with TS2322
- `effectBuf0` layout split: system flags (lit, receiveShadows, castsShadow) in `.x`; 24 effect enable bits in `.y` — recovers the capacity lost to the flag addition
- Dev-time warning (deduped, suppressed in production) when lit sprites attach without a provider for a required channel

**Devtools — producer side:**
- Debug bus via `BroadcastChannel('flatland-debug')`, gated by `DEVTOOLS_BUNDLED` (`import.meta.env.DEV || VITE_FLATLAND_DEVTOOLS=true`) — zero bytes/runtime in prod builds; `window.__FLATLAND_DEVTOOLS__=false` runtime opt-out
- `DevtoolsProvider` (renamed from `DevtoolsProducer`): multi-provider `provider:announce/query/gone` discovery protocol; `FlatlandOptions.name` to distinguish multiple instances
- Explicit `beginFrame(now, renderer)` / `endFrame(renderer)` API on `DevtoolsProvider` and `StatsCollector` — fixes ~6× inflated FPS reporting in multi-pass scenes
- Per-frame stats flushed as batched typed-array delta packets (250ms batches, zero-copy `subarray` views)
- `DebugRegistry`: module-level `registerDebugArray`/`touchDebugArray` sink for publishing CPU typed arrays (no-op in prod)
- `DebugTextureRegistry`: GPU buffer readback with `maxDim` downsampling — 1920×1080 SDF reads back at ~150 KB instead of 8 MB per drain
- `perf-track.ts`: `perfMeasure`/`perfStart` helpers emitting User Timing spans on the `three-flatland` Chrome custom track
- Bus offload-worker scaffolding: `BusTransport` interface with `WorkerBusTransport` (spawns dedicated worker) and `InlineBusTransport` fallback; `bus-pool.ts` two-tier buffer pool (4 KB×8, 256 KB×4)

**Bug fixes:**
- Wire protocol: absent delta fields now use `delete` instead of `undefined` — fixes ghost keys in structured-clone payloads that caused confusing consumer state
- Server emits idle `ping` when no `data` has been broadcast in 2 s, allowing consumers to distinguish idle from dead

**Example:**
- `examples/react/lighting`: dungeon-floor tilemap, wandering sprite point lights (slimes), flickering torches, keyboard-controlled hero, `castsShadow` wall sprites, Tweakpane devtools panel

This release delivers the complete 2D lighting pipeline — JFA SDF generation, Forward+ tiled culling, per-sprite shadow casting, and a fully instrumented devtools producer — all integrated into `three-flatland`'s ECS architecture.


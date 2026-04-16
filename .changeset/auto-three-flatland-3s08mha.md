---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D Lighting system**
- New `Light2D` class: `point`, `directional`, `ambient`, `spot` types
- `LightStore`: typed-array DataTexture backing for GPU light data; published to devtools registry
- `ForwardPlusLighting`: tiled light culling — tile overflow now uses an importance-based reservoir (score = intensity × distance falloff against tile AABB) instead of silent drop-on-submission-order, fixing tile-edge flicker in dense scenes
- `SDFGenerator`: JFA-based signed distance field generation from occluder silhouettes
- `OcclusionPass`: renders sprite silhouettes filtered by `castsShadow` per instance; per-texture material cache; zero-alloc scene traverse
- `LightEffect` ECS trait + `setLighting(effect)` API on `Flatland`; `LightEffectBuildContext` carries `sdfTexture`, `worldSizeNode`, `worldOffsetNode`
- `ShadowPipeline` singleton ECS trait + `shadowPipelineSystem`: owns full `SDFGenerator` / `OcclusionPass` lifecycle; `setLighting` eagerly allocates when effect declares `needsShadows`; system is idempotent on subsequent ticks
- `LightingContext.sdfGenerator` mirror removed; `lightEffectSystem` queries `ShadowPipeline` trait directly
- React `attach` helpers for wiring light effects in JSX

**Per-sprite shadow flags**
- `Sprite2D.castsShadow`: per-instance opt-in shadow caster (bit 2 of `effectBuf0.x`); default off
- `effectBuf0.x/y` split: system flags isolated to `.x` (24 free bits for future use); effect enable bits moved to `.y` (24 slots, up from 21 mixed with system flags)

**MaterialEffect type safety**
- `createMaterialEffect` now generic over `provides` tuple: `channelNode` return type statically constrained to `ChannelNodeMap[C[number]]` — wrong node type is a `tsc` error, not a silent runtime shader bug
- Omitting `provides` while supplying a `channelNode` is also a compile-time error

**Dev-time warnings**
- `setLighting` and `add(sprite)` emit one warning per lit sprite missing required channel providers, deduped via `WeakSet`; suppressed under `NODE_ENV=production`

**Debug / devtools bus (producer side)**
- `DevtoolsProvider` (extracted from `Flatland`, was `DevtoolsProducer`): publishes frame stats, env info, CPU typed-array registry, GPU texture readbacks
- Multi-provider discovery: `provider:announce/query/gone` protocol; `FlatlandOptions.name` distinguishes instances; `DevtoolsProvider._createSystem()` factory for internal use
- `BusTransport` / `WorkerBusTransport`: offloads BroadcastChannel hot path to a worker with a two-tier buffer pool (small 4 KB × 8, large 256 KB × 4); zero render-thread allocs per flush via typed-array views and `postMessage` transfer
- `DebugRegistry`: module-level `registerDebugArray` / `touchDebugArray` sink, no-op when `DEVTOOLS_BUNDLED` is false
- `DebugTextureRegistry`: async GPU readback with `maxDim` downsampling cap; `LightStore.lightsTexture` and `ForwardPlusLighting._tileTexture` published
- `perf-track.ts`: `perfMeasure` / `perfStart` emit User Timing spans on Chrome's `three-flatland` custom track
- Frame stats use explicit `beginFrame()` / `endFrame()` boundaries — fixes multi-pass FPS inflation (was ~6× true rate when SDF + occlusion + main + post passes each incremented the counter)
- Debug protocol: two-channel `BroadcastChannel` split (discovery vs per-provider data); delta-encoded payloads with `absent = no change`, `null = clear`; idle ping when data is silent for `IDLE_PING_MS` (2 s)

**Examples**
- New `examples/react/lighting`: dungeon floor, `castsShadow` walls, wandering point-light characters, flickering torches, WASD hero knight, Tweakpane panel

This release delivers a complete end-to-end 2D lighting pipeline — from JFA-based SDF shadow generation through per-sprite occlusion to soft-shadow consumption in shader effects — alongside a zero-overhead-in-production debug bus with worker-offloaded data transfer.


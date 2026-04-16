---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting pipeline**

- `Light2D` class with point, directional, ambient, and spot light types
- `LightEffect` API: `flatland.setLighting(effect)` installs a shader-build strategy; `LightEffectBuildContext` carries `lightStore`, `sdfTexture`, `worldSizeNode`, and `worldOffsetNode`
- `LightStore` — typed-array backed light data texture; registered to devtools as `lightStore.lights`
- `ForwardPlusLighting` — tiled Forward+ culling; tile DataTexture registered as `forwardPlus.tiles`
- `SDFGenerator` — JFA-based signed-distance-field generation from an occlusion render target
- `OcclusionPass` — renders the scene into a resolution-scaled silhouette render target; per-sprite `castsShadow` flag filters non-casters inside the batch shader
- `ShadowPipeline` ECS trait + `shadowPipelineSystem`: shadow resources managed as a singleton ECS entity, allocated lazily on first tick when `needsShadows = true`
- World-bound uniforms (`worldSizeNode`, `worldOffsetNode`) owned by Flatland, updated each frame from camera bounds at zero shader-rebuild cost
- Forward+ tile-light overflow: importance-based reservoir eviction replaces silent drop — dense light clusters degrade gracefully to highest-contribution lights
- React helpers: `attach` utilities for `<lightEffect>` and `<light2D>` JSX elements

**Per-sprite shadow flags**

- `sprite.castsShadow` (default `false`) — opt-in per-sprite shadow casting; wired through batch attribute buffer at zero rebuild cost
- `sprite.lit`, `sprite.receiveShadows` continue to work as before
- `effectBuf0.x` now holds only the 3 system flags (lit, receiveShadows, castsShadow); `effectBuf0.y` holds the 24 MaterialEffect enable bits — expands available MaterialEffect slots from 21 to 24

**MaterialEffect type safety**

- `createMaterialEffect` is now generic over the `provides` tuple — `channelNode` return type is constrained to the declared channel map; mismatched node types fail `tsc` at the factory call site
- Omitting `provides` while supplying `channelNode` is also a type error

**Dev-time validation**

- `flatland.setLighting(effect)` and `flatland.add(sprite)` emit a one-time warning per sprite when a lit sprite is missing a MaterialEffect that provides a required channel (e.g. `normal`); suppressed in production

**Devtools bus (provider side)**

- `DevtoolsProvider` (formerly `DevtoolsProducer`) — standalone class; Flatland constructs one internally via `_createSystem()`; vanilla apps use `createDevtoolsProvider(opts?)`
- `beginFrame(now, renderer)` / `endFrame(renderer)` explicit frame-boundary API; `Flatland.render()` brackets these automatically — FPS and draw-call stats now reflect the logical frame across all internal render passes
- Zero-alloc hot path: scratch message objects mutated in place; typed-array ring buffers flushed via `subarray` views; BroadcastChannel posting offloaded to a pool-buffered worker
- `DebugRegistry` — module-level `registerDebugArray`/`touchDebugArray` sink for CPU typed arrays; no-op when `DEVTOOLS_BUNDLED` is false; ForwardPlusLighting publishes `lightCounts` and `tileScores`
- `DebugTextureRegistry` — registers GPU textures/render-targets for async readback; `maxDim` cap (default 256) with GPU downsampler blit before readback
- Two-channel bus: shared `flatland-debug` discovery channel + per-provider data channels; multi-provider discovery with user-over-system preference and auto-switch on disconnect
- Debug protocol uses delta encoding: absent field = no change, `null` = clear, value = new; `DataPayload.frame` monotonic counter for gap detection
- `perf-track.ts` emits User Timing spans on Chrome's custom-track extension (`trackGroup: 'three-flatland'`)

**Fixes**

- Fixed FPS reporting ~6x too high when Flatland ran multiple internal render passes per logical frame
- Fixed debug wire bloat: `delete out.field` instead of `out.field = undefined` so absent delta fields are truly absent in `structuredClone`
- Fixed `tileScores` at 1080p (~510 KB) blowing past the old 256 KB pool tier and causing `copyTypedTo` to throw on every flush

## BREAKING CHANGES

- `Flatland.stats` getter removed; per-frame draw stats now flow through `DevtoolsProvider`/`DevtoolsClient`
- `drawCalls` removed from the `RenderStats` interface (was always `0` in `SpriteGroup.stats`)
- `effectBuf0.y` is now reserved for MaterialEffect enable bits; custom shaders reading packed effect bits from `effectBuf0.x` beyond bit 2 must shift their masks to `effectBuf0.y`
- `DevtoolsProducer` class renamed to `DevtoolsProvider`; `setAutoSend` removed (use `beginFrame`/`endFrame`)

This release delivers a complete 2D lighting pipeline with JFA SDF shadows, Forward+ tiled culling, per-sprite shadow casting, and a zero-alloc devtools bus with live GPU buffer inspection.


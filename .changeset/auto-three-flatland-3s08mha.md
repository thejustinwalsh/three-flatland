---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27


**2D lighting pipeline, ECS shadow system, devtools bus, and effect system improvements**

### 2D lighting system

- `Light2D` class: point, directional, ambient, and spot light types
- `LightStore`: typed-array DataTexture backing for per-frame light data; publishes `lightStore.lights` to the debug registry
- `ForwardPlusLighting`: tiled light culling with per-tile reservoir-based overflow — dense light clusters now degrade to most-contributing lights instead of dropping by submission order; publishes `forwardPlus.tiles` to the debug registry
- `SDFGenerator`: JFA-based signed distance field generation from an occlusion render target; eagerly allocates stable 1×1 placeholder RTs at construction so TSL `texture()` bindings captured at shader build time remain valid across resize
- `OcclusionPass`: offscreen silhouette render target at configurable resolution scale (default 0.5×); per-sprite `castsShadow` masking via instance attribute; material cache keyed by source atlas texture; zero-alloc scene traversal
- `LightEffect` / `LightEffectBuildContext`: `sdfTexture`, `worldSizeNode`, and `worldOffsetNode` threaded through build context so effects bind SDF and camera-derived world-bounds uniforms at shader build time
- `LightingSystem`, `lightEffectSystem`, `lightSyncSystem`, `lightMaterialAssignSystem`: ECS systems managing the full light-effect lifecycle
- `ShadowPipeline` ECS singleton trait + `shadowPipelineSystem`: owns SDFGenerator + OcclusionPass lifecycle (allocate, init, resize, pre-pass, dispose); removed six private fields from `Flatland`

### Per-sprite shadow flags

- `Sprite2D.castsShadow`: per-instance opt-in shadow-caster flag (bit 2 of `effectBuf0.x`); zero-rebuild setter, same path as `lit` / `receiveShadows`
- `effectBuf0` layout split: system flags (lit, receiveShadows, castsShadow) isolated to `.x`; effect enable bits moved to `.y` — user `MaterialEffect` slots increased from 21 to 24
- `readCastShadowFlag()` TSL helper mirrors `readReceiveShadowsFlag()`

### Effect channel system

- `createMaterialEffect` generic over declared `provides` tuple — `channelNode` return type constrained to `ChannelNodeMap[C[number]]`; mismatched channel type is now a compile-time `tsc` error
- Dev-time warning when a lit sprite has no `MaterialEffect` that provides channels required by the active `LightEffect`; deduped via `WeakSet`; suppressed in `NODE_ENV=production`

### Devtools debug bus

- `DevtoolsProvider` (formerly `DevtoolsProducer`): BroadcastChannel-based debug bus with multi-provider discovery protocol (`provider:announce` / `provider:query` / `provider:gone`); `FlatlandOptions.name` to distinguish multiple instances
- `StatsCollector`: frame-boundary measurement via explicit `beginFrame` / `endFrame` — FPS and draw counts aggregate across all internal render passes
- `EnvCollector`: backend capabilities + canvas dimensions delta-encoded; full snapshot in `subscribe:ack`
- `DebugRegistry`: CPU typed-array publishing sink (`registerDebugArray` / `touchDebugArray`); no-op when `DEVTOOLS_BUNDLED` is false
- `DebugTextureRegistry`: GPU buffer publishing with async readback, `maxDim` cap, lazy `Downsampler`
- Worker bus transport: `BusTransport` abstraction; `WorkerBusTransport` offloads BroadcastChannel to a worker with pool-buffer transfer for zero render-thread allocs; `InlineBusTransport` fallback
- `createDevtoolsProvider(opts?)` exported from `three-flatland` for vanilla three.js apps without a `Flatland` instance
- Bus pool tiers bumped to 2 MB large (was 256 KB); oversized entries ship metadata-only with a one-shot warn

### Bug fixes

- Delta wire format: absent fields now deleted (`delete out.field`) rather than set to `undefined` — `structuredClone` in `postMessage` was shipping all-undefined-valued keys as explicit wire noise
- Server idle ping every 2 s when no `data` has been broadcast; consumers re-subscribe after 5 s of silence

Full 2D lighting pipeline from JFA shadow SDF through Forward+ tiled culling and per-sprite normal mapping, with a production-safe devtools bus for live inspection of lighting internals.

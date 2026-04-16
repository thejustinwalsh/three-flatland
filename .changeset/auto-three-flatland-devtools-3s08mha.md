---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New: DevtoolsClient, panel, and provider helpers**

- `DevtoolsClient` — framework-agnostic bus consumer; subscribes to a provider, accumulates delta state, exposes `state: DevtoolsState` and an `onChange` callback
- `mountDevtoolsPanel(pane)` / `useDevtoolsPanel(pane)` — mounts a Tweakpane folder with liveness, perf, scene, and environment sub-folders; returns a `dispose()` handle
- `createPane` / `usePane` now auto-mount the devtools panel by default (`debug: true`); no separate mount call needed
- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` for vanilla apps that don't use `Flatland`

**Debug buffer viewer (Phase C)**

- Live GPU buffer thumbnails in the devtools pane: `◀ name ▶` arrows cycle registered buffers, 240×120 canvas thumbnail with dimensions/format chip overlay
- Fullscreen modal (click `⤢`): collapsible buffer list sidebar, aspect-correct canvas, `Esc` to close; streams only the active buffer to minimize bandwidth
- Four display modes: `colors`, `normalize`, `mono`, `signed` (red↔green diverging for SDFs); format-driven defaults
- `LightStore.lightsTexture` and `ForwardPlusLighting._tileTexture` registered automatically

**Multi-provider discovery**

- Providers announce their identity (`id`, `name`, `kind`) over a shared `flatland-debug` discovery channel; clients auto-pick user providers over system providers
- `client.selectProvider(id)` for manual override; auto-switch on `provider:gone`
- `FlatlandOptions.name?` lets multiple Flatland instances appear with distinct labels

**Performance improvements**

- Stats graph replaced SVG polyline with Canvas `beginPath`/`lineTo` — eliminates ~5k template-literal allocations/s and CSS selector churn
- `StatsCollector.maybeResolveGpu` throttled to 10 Hz (from 60 Hz); 6x reduction in Promise/closure allocation
- Buffer thumbnail `ImageData` cached across paints when dimensions are unchanged
- `DebugTextureRegistry` downsamples render targets larger than `maxDim` (default 256) via a GPU blit before readback — 1080p SDF reads back as 256×144 instead of 8 MB
- `DevtoolsProvider` offloads BroadcastChannel posting to a pool-buffered worker; zero `structuredClone` on the render thread for data payloads
- Snapshot mutations in place (`_applyRegistry`/`_applyBuffers`); `toFixed` strings cached per rounded value in `stats-graph`
- Bus pool: two tiers (small 4 KB×8, large 2 MB×4); `BufferCursor`/`copyTypedTo` helpers for zero-copy typed-array encoding

**Protocol and API renames**

- `subscribe.registryFilter`/`atlasFilter` renamed to `subscribe.registry`/`subscribe.buffers` for consistency with the `features` shape
- `setRegistryFilter` renamed to `setRegistry` on `DevtoolsClient`
- `DevtoolsProducer` renamed to `DevtoolsProvider` throughout

**Fixes**

- R3F `useFrame` updated from positional priority to `{ priority: 1000 }` options-object form; suppresses deprecation warning in all React examples
- Large debug pool tier bumped to 2 MB; oversized entries now ship metadata-only with a one-shot warning instead of throwing

## BREAKING CHANGES

- `setRegistryFilter(names)` on `DevtoolsClient` renamed to `setRegistry(names)`
- `subscribe` payload fields `registryFilter` and `atlasFilter` renamed to `registry` and `buffers`

This release delivers a fully instrumented devtools pipeline: zero-alloc producer, pooled worker transport, live GPU buffer inspection, multi-provider discovery, and a fullscreen buffer viewer.


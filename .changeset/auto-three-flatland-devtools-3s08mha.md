---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New features:**
- `DevtoolsClient`: framework-agnostic bus consumer; subscribes to a `DevtoolsProvider`, accumulates delta state, exposes `addListener` / `removeListener`
- `mountDevtoolsPanel` / `useDevtoolsPanel`: mounts a readonly Tweakpane panel with Liveness, Perf, Scene, and Environment folders
- Multi-provider discovery protocol: `provider:announce` / `provider:query` / `provider:gone` with automatic provider selection (user over system) and auto-switch on disconnect; `client.selectProvider(id)` for manual override
- `createPane` / `usePane` now auto-mount the devtools panel; explicit `mountDevtoolsPanel` call no longer needed
- Shared `DevtoolsClient` across panel and stats graph — single source of truth for all displayed values
- `FlatlandOptions.name` lets users label multiple Flatland instances in the UI

**Phase B — DebugRegistry:**
- `registerDebugArray` / `touchDebugArray` / `unregisterDebugArray` module-level sink (no-op in prod builds)
- Collapsible grouped registry blade in the pane; per-entry filter on subscribe so only visible data crosses the wire
- `ForwardPlusLighting` publishes `lightCounts` and `tileScores`; `LightStore` publishes its DataTexture backing

**Phase C — GPU buffer viewer:**
- `DebugTextureRegistry`: async GPU readback for `DataTexture` and `RenderTarget`; per-entry `maxDim` cap (default 256) with TSL `Downsampler` blit to avoid multi-MB readbacks
- Live 240×120 thumbnail blade with four display modes: `colors`, `normalize`, `mono`, `signed` (red/green diverging)
- Fullscreen modal on expand: collapsible buffer sidebar, aspect-correct canvas, selection drives `client.setBuffers()` to stream only the active buffer; Esc to close
- `perf-track.ts`: User Timing spans on Chrome's custom-track extension (`trackGroup: 'three-flatland'`, tracks `devtools`, `lighting`, `sprites`, `sdf`)

**Protocol changes:**
- Two BroadcastChannels: shared discovery (`flatland-debug`) + per-provider data (`flatland-debug:<id>`)
- Subscribe/ack protocol replaces ping/pong heartbeat; idle server emits `ping` every 2 s when data is quiet
- `registry` / `buffers` selection fields on subscribe payload (renamed from `registryFilter` / `atlasFilter`)

**Performance:**
- Stats graph rewritten from SVG polyline to Canvas `beginPath`/`lineTo` — eliminates per-rAF string allocation and DOM mutation
- `maybeResolveGpu` throttled from 60 Hz to 10 Hz; drops Promise closure churn by 6×
- `_applyRegistry` / `_applyBuffers` mutate snapshots in place; `toFixed` strings cached per mode
- Off-thread BroadcastChannel hot path: `BusTransport` worker pool with `BufferCursor` + `copyTypedTo` — zero `structuredClone` on the render thread
- `POOL.large.size` raised to 2 MB; fail-soft on oversized entries to prevent flush failures at 1080p

**Bug fixes:**
- Fixed `[useFrame] Job already exists` warning and FPS showing `--` by dropping the priority option from `usePane`'s `useFrame` call
- Fixed "React state update on unmounted component" in `usePaneInput` by gating change handler on `mountedRef`
- Fixed FPS reporting ~6× actual rate when Flatland runs multiple internal render passes per frame (SDF, occlusion, main, post)
- Fixed debug wire bloat from `undefined`-valued delta fields (switched to `delete` on reset)

This release delivers a complete devtools consumer pipeline: real-time FPS/CPU/GPU stats, typed-array registry inspection, live GPU buffer thumbnails with a fullscreen viewer, multi-provider discovery, and a zero-alloc off-thread broadcast path.

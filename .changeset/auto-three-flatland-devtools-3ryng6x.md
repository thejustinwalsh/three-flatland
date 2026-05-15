---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Dashboard**
- Preact-based devtools dashboard with panels for stats, environment, batch inspector, buffer viewer, registry, and protocol log
- Vite plugin bundles dashboard as a separate entry; `build:bundle` Turbo task for CI integration
- Dashboard auto-mounts when `debug: true` via `createPane`/`usePane` — no separate `mountDevtoolsPanel` call needed
- `DevtoolsClient` + `mountDevtoolsPanel` / `useDevtoolsPanel` for framework-agnostic and React panel mounting

**Debug protocol**
- Two `BroadcastChannel` split: shared discovery channel (`flatland-debug`) + per-provider data channel (`flatland-debug:<id>`)
- Multi-provider discovery — `provider:announce`, `provider:query`, `provider:gone`; client auto-switches when selected provider disconnects; `client.selectProvider(id)` for manual override
- Per-feature subscribe with `features`, `registry`, and `buffers` selection keys; idle panes set `features: []` to zero bandwidth
- `FlatlandOptions.name` distinguishes multiple Flatland instances in the UI
- `createDevtoolsProvider()` helper for vanilla Three.js apps that don't construct a `Flatland`
- Frame-boundary stats via explicit `beginFrame`/`endFrame` — FPS and draw stats aggregate across internal multi-pass renders (SDF, occlusion, main, post)

**Stats graph**
- Canvas-based sparkline replaces SVG `polyline` (eliminates per-rAF DOM string + selector invalidation)
- GPU timing detection; stats visibility gated on `EXT_disjoint_timer_query_webgl2` availability
- `StatsCollector` GPU drain throttled to 10 Hz; `toFixed` string results cached per mode
- Axis hysteresis with trimmed-max for stable Y scale; bucketed axis range for sparkline stability

**GPU buffer viewer**
- `DebugTextureRegistry` with configurable `maxDim` cap (default 256px for render targets) and lazy `Downsampler` — large RTs read back at reduced resolution
- Live buffer thumbnail blade: `◀ name ▶` arrow navigation, `colors`/`normalize`/`mono`/`signed` display modes with format-driven defaults
- Fullscreen modal (⤢ button): collapsible sidebar tree, aspect-correct canvas with `image-rendering: pixelated`, Esc to close
- WebCodecs VP9 encoding for fullscreen stream; VideoDecoder on consumer; graceful fallback to raw pixels on Firefox/older Safari
- Modal pan/zoom: wheel zoom centered on cursor, drag to pan, double-click or reset button to restore, extents clamped 0.25×–64×
- Pixel format conversion unified on worker thread; GPU row-padding (WebGPU 256-byte alignment) detected and stripped; `'alpha'` display mode for single-channel occlusion mask
- SDF distance field, occlusion mask, Forward+ tile texture, LightStore DataTexture, Radiance/cascade/JFA intermediates all registered as debug textures
- Texture readback moved to end-of-frame so captures are coherent with complete render pipeline output
- Thumbnail selection and fullscreen modal selection stay synchronized via `setModalOpen`/`setActiveFromModal` callbacks

**React hooks**
- `DevtoolsProvider` React component: pure constructor (no BroadcastChannel/Worker side-effects); explicit `start()`/`dispose()` lifecycle; safe for R3F reconciler StrictMode remounts
- `usePane`: `driver:'raf'` self-ticks stats graph; no `useFrame` dependency, works outside `<Canvas>`
- `usePaneFolder`/`usePaneInput`: `useLayoutEffect` with `[parent, key]` deps replaces `setTimeout` disposal hack; `change` listener gated on `mountedRef` to drop late events
- Controls pane minimal mode for compact single-line display

**Fixes**
- Float textures (`rgba16f`/`rgba32f`) skip VP9 encode path — encoder requires 8-bit RGBA
- `paint()` skipped when `VideoDecoder` is active to avoid overwriting decoded frames
- Stream subscription refreshed on buffer switch; keyframe forced on new subscriber and buffer switch
- Pool buffer pixel byte-length passed separately from pool size (2 MB pool, ~900 KB payload)

Major update to `@three-flatland/devtools`: Preact dashboard, GPU buffer streaming with WebCodecs VP9, multi-provider discovery, and a full GPU texture inspection pipeline including signed SDF and occlusion mask visualizations.

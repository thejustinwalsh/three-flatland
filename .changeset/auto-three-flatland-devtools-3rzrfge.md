---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Dashboard (new)**
- Vite plugin serves the devtools dashboard as an embedded SPA (`@three-flatland/devtools/vite-plugin`)
- Dashboard panels: producer select, env info, batch inspector, registry view, buffers view, stats, protocol log
- `BatchCollector` publishes per-batch ECS data to the dashboard

**Buffer inspector**
- Live GPU buffer thumbnails in the pane: `◀ name ▶` arrow navigation, 240×120 thumbnail with dimension/format chip
- Fullscreen modal with mouse-wheel zoom centered on cursor, drag to pan, reset on buffer switch
- VP9 video encoding (WebCodecs) for low-overhead fullscreen streaming; falls back to raw-pixel path when WebCodecs unavailable
- Modal and thumbnail selection stay synchronized — thumbnail defers to modal while open
- Debug textures registered: `sdf.distanceField` (signed distance, rgba16f), `occlusion.mask` (binary silhouette, rgba8), radiance cascade levels, JFA ping/pong buffers

**Pixel conversion (worker-side)**
- All format conversion (`rgba8`, `r8`, `rgba16f`, `rgba32f`) runs on the bus worker thread
- Display modes: `colors`, `normalize`, `mono`, `signed`, `alpha`
- GPU row-padding (WebGPU 256-byte `bytesPerRow` alignment) handled correctly
- `alpha` display mode for occlusion mask where data is in the A channel only

**Controls pane**
- Minimal mode for compact overlay layout

**Stats sparkline**
- Bucketed axis-range algorithm stabilizes the Y axis against transient spikes
- Canvas-based rendering replaces SVG polyline — eliminates per-frame DOM mutation and string allocation

**DevtoolsProvider transport**
- Off-thread BroadcastChannel via a dedicated bus worker with transferable pool buffers — zero allocations on the render thread per flush
- Pool tiers: small 4 KB × 8, large 2 MB × 4; oversized entries ship metadata-only with a one-shot warning
- `SubscriberRegistry` tracks per-consumer buffer selections and drains only the selected union
- Debug registrations queued before provider start are replayed when the registry becomes available

**React hooks**
- `usePane` self-ticks via `driver:'raf'` — no `useFrame` dependency
- `usePaneFolder` / `usePaneInput` use `useLayoutEffect` with `[parent, key]` deps; cleanup is immediate (no `setTimeout` hack)
- New `<DevtoolsProvider />` component — passive sampler, safe in production builds (tree-shaken when `DEVTOOLS_BUNDLED` is false)
- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` for vanilla apps that don't construct a `Flatland`

This release ships the full devtools dashboard, GPU buffer inspector with VP9 streaming, and a zero-alloc render-thread data path.

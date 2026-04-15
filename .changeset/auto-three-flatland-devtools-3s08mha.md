---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Renamed from `@three-flatland/tweakpane`

The package was renamed `@three-flatland/tweakpane` → `@three-flatland/devtools`.

## `DevtoolsClient`

- Framework-agnostic bus consumer; subscribes to a `DevtoolsProvider`, accumulates delta state per the debug protocol
- Multi-listener via `addListener(cb)` / `removeListener(cb)`
- Multi-provider discovery: `DevtoolsState.providers` + `selectedProviderId`; `client.selectProvider(id)` for manual override
- Auto-reconnect: re-subscribes after `SERVER_LIVENESS_MS` of silence

## Panel and hooks

- `mountDevtoolsPanel(pane, options?)` — readonly Tweakpane folder with sub-folders: Liveness, Perf, Scene, Environment
- `useDevtoolsPanel(pane)` — React hook; mounts on first render, disposes on unmount
- `createPane` / `usePane` auto-mount the devtools panel when `debug: true` (default) — no separate call to `mountDevtoolsPanel` needed
- `options.client` lets callers share a pre-existing `DevtoolsClient` across the panel and stats graph/row (single source of truth for frame stats)

## DebugRegistry blade

- Grouped, collapsible view of CPU typed arrays published via `registerDebugArray`; per-entry selection throttles wire bandwidth
- `◀ name ▶` arrows cycle groups; collapsing hides data from the wire entirely
- `ForwardPlusLighting` publishes `lightCounts` and `tileScores`; `LightStore` publishes its DataTexture backing

## GPU buffer thumbnail blade

- `buffers-view`: `◀ name ▶` selector cycles registered GPU buffers; 240×120 thumbnail backed by async GPU readback
- Four decode modes: `colors`, `normalize`, `signed` (diverging red/green), `mono`
- ResizeObserver keeps canvas backing locked to CSS size × DPR

## Performance tracing

- `tracePerf` emits `performance.measure` spans on every inbound bus message — visible in Chrome DevTools Performance → Timings

Adds `DevtoolsClient`, devtools panel, DebugRegistry and GPU buffer thumbnail blades, and auto-mounts the panel from `createPane`/`usePane` with no extra wiring.

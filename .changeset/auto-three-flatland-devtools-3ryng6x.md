---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Dashboard & Integration

- `DevtoolsClient` + `mountDevtoolsPanel` + `useDevtoolsPanel` — single shared client across panel, stats graph, and stats row
- Vite plugin for bundling the devtools dashboard as a standalone asset
- Preact module type definitions and implementation for the dashboard
- Build bundle task (`turbo`) for dashboard inputs; dashboard diagrams added to docs public assets
- Controls minimal mode for compact panel layout

## Buffer Viewer

- Fullscreen buffer viewer modal with pan/zoom, overflow clip, extents, and info overlay
- Pan/zoom controls relocated to top-left; zoom level always visible, reset hidden at identity
- Modal and thumbnail buffer selection kept in sync; stream subscription updated on buffer switch
- `BufferDisplayMode`: `'colors' | 'normalize' | 'mono' | 'signed'` with format-driven defaults

## Debug Texture Streaming

- WebCodecs VP9 encoding for fullscreen buffer streaming at 4 Hz
- Worker-side pixel format conversion; unified row-padding and alpha display in conversion worker
- Texture readback moved to end-of-frame to avoid mid-render data races
- Large pool tier bumped to 2 MB; oversized entries fail soft
- `DevtoolsProvider` React lifecycle overhauled; `createDevtoolsProvider` helper added for non-R3F apps
- R3F `useFrame` priority API used for correct render ordering
- Debug registrations queued when they arrive before provider start

## Stats & Registry

- Bucketed axis range for sparkline stability (axis hysteresis with trimmed max)
- All lighting pipeline debug textures registered (`SDFGenerator`, `OcclusionPass`, forward+ tile texture)
- GPU timing detection; stats panel sections shown/hidden based on `EXT_disjoint_timer_query_webgl2` availability
- Registry panel visual enhancements; typecheck script and tsconfig paths corrected

Devtools receives a complete dashboard (buffer viewer, stats, registry), GPU timing support, and a VP9-encoded fullscreen texture streaming pipeline.

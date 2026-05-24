---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Devtools dashboard** — a standalone Preact-based debug dashboard served via a Vite plugin.

**Vite plugin**
- `@three-flatland/devtools/vite` plugin builds and serves the dashboard in dev mode; bundled separately via `vite.config.bundle.ts`

**Dashboard panels**
- Batches panel: per-batch sprite counts and state
- Buffers panel: live debug texture viewer with VP9-streamed or raw-pixel display; pan/zoom modal with drag-to-pan, mouse-wheel zoom (0.25x–64x), and cursor-reset on double-click
- Stats panel: GPU frame timing (when `timestamp-query` is available), CPU/GPU sparklines with bucketed axis range and hysteresis for stable rendering, GPU timing capability detection
- Env panel: renderer capabilities and environment info
- Protocol log: raw devtools message stream
- Registry panel: registered effect and texture list

**Buffer viewer**
- All pixel format conversion (rgba8, r8, rgba16f, rgba32f) moved to worker thread; main thread receives display-ready RGBA8 only
- GPU row padding (WebGPU 256-byte `bytesPerRow` alignment) detected and handled correctly
- Alpha display mode: reads A channel as greyscale for occlusion mask buffers
- Modal and thumbnail buffer selections stay in sync; modal defers to thumbnail on close

**Controls**
- Tweakpane minimal mode for compact in-scene panes

**React hooks**
- `usePane`, `usePaneFolder`, `usePaneInput` rewritten to use `useEffectEvent` (stable in React 19.2) — eliminates "refs during render" diagnostics from react-hooks@7 / React Compiler
- React peer requirement bumped to `^19.2.0`

**Bug fixes**
- Typecheck script now specifies the correct `tsconfig`
- Modal paint path no longer wipes VP9 decoder output on state change
- Float textures (rgba16f/rgba32f) skip VP9 encoding (encoder requires 8-bit RGBA input)
- Stream subscription correctly re-established when switching buffers in modal

This release ships a fully functional standalone devtools dashboard with live texture streaming, GPU timing, and an improved Tweakpane integration requiring React 19.2.

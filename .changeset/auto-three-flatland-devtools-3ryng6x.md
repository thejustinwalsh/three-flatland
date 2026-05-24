---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Dashboard

- Stats pipeline: per-frame samples collected into preallocated typed-array rings; flushed in 250ms batches via `subarray` views (zero copy); client decodes into Float32 series rings with scalar batch means for text labels
- Sparkline graph: canvas replaces SVG polyline, eliminating per-frame DOM string allocations; bucketed axis range prevents jitter; axis hysteresis with trimmed max for stable rendering
- `DebugRegistry` and debug buffer thumbnail blade (Phase C MVP): live GPU buffer thumbnails in the pane with group-prefix collapsible tree
- Fullscreen buffer modal: pan/zoom (wheel centered on cursor, drag to pan, 0.25×–64× range), sidebar with collapsible group tree, buffer switch resets transform
- WebCodecs VP9 encoding for fullscreen modal streaming: worker-side `VideoEncoder`, consumer `VideoDecoder` + `VideoFrame` rendering; falls back to raw pixel paint
- GPU timing detection; stats panel items hidden when the capability is absent
- Preact module type definitions and implementation for the dashboard

## Protocol

- `Producer` renamed to `Provider` throughout; multi-provider discovery protocol: consumers find providers via BroadcastChannel, pick by preference, auto-switch on appear/disappear
- BusTransport + offload-worker pool: pixel format conversion happens on the worker thread; provider ships raw bytes, worker converts to display-ready RGBA8 before broadcast
- All lighting pipeline debug textures registered (SDF ping/pong, occlusion, light atlas)
- Texture readback moved to end-of-frame; live render-target dimensions read at drain time
- Keyframe forced on buffer switch in stream mode; registrations queued if they arrive before provider start

## Fixes

- `DevtoolsProvider` constructor is now side-effect-free — no `BroadcastChannel`, no `Worker`, no timers on construction; safe for R3F speculative/discarded renders
- `usePane`, `usePaneFolder`, `usePaneInput` rewritten for React 19.2: `useState` lazy initializer for bundle; `useEffectEvent` replaces lazy-ref/latest-ref patterns flagged by `react-hooks@7` React Compiler diagnostics
- Fixed modal `paint()` wiping `VideoDecoder` output in stream mode
- Fixed thumbnail `syncSelection()` overwriting the modal's buffer subscription on every state change
- Fixed pan/zoom overflow: `overflow:hidden` clips transformed canvas; wheel listener on container prevents page scroll
- `useFrame` priority switched to options-object form `{ priority: 1000 }` (positional form deprecated in R3F v10)
- `createDevtoolsProvider` helper exported for non-Flatland (plain Three.js) apps

## BREAKING CHANGES

- `usePane`, `usePaneFolder`, and `usePaneInput` now require React ≥ 19.2 (`useEffectEvent`)

This release ships the full Phase C devtools dashboard: live GPU buffer inspection with pan/zoom modal, VP9 streaming, multi-provider discovery, and zero-alloc batched stats.

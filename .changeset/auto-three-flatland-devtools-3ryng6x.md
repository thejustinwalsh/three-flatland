---
"@three-flatland/devtools": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**Devtools dashboard, buffer viewer, and React hook overhaul for the lighting-stochastic-adoption branch.**

### New features

- Vite plugin for the devtools dashboard (`@three-flatland/devtools/vite-plugin`) — serves dashboard from `__devtools__` path
- Full dashboard (Preact, vendored) with panels: batches, env, stats sparklines, buffer texture viewer, registry, protocol log
- Fullscreen buffer modal: pan/zoom, sidebar buffer list, aspect-correct canvas with `image-rendering: pixelated`
- WebCodecs VP9 encoding for fullscreen streaming; transparent fallback to raw pixels on unsupported browsers
- Worker-side pixel format conversion for rgba8, r8, rgba16f, rgba32f with display modes (colors, normalize, mono, signed, alpha)
- GPU row padding detection — correctly handles WebGPU's 256-byte `bytesPerRow` alignment that `three.js r183` does not strip
- GPU timing detection; stats panel conditionally shows GPU metrics when `timestamp-query` is available
- Bucketed axis range for sparklines (trimmed max, hysteresis) for stable rendering
- Minimal mode for the Tweakpane controls pane

### API changes

- `DevtoolsProvider` constructor is now side-effect-free; explicit `start()` / `dispose()` lifecycle (both idempotent)
- `createDevtoolsProvider(opts?)` exported from `three-flatland` — returns a live provider or a no-op stub; enables devtools in vanilla apps without a `Flatland` instance
- `<DevtoolsProvider />` React component added for non-Flatland R3F scenes

### React hooks (React 19.2+ required)

- `usePane` / `usePaneFolder` / `usePaneInput` rewritten with `useEffectEvent` — resolves React Compiler "refs during render" diagnostics
- `usePane` dropped `useFrame` dependency; stats graph self-ticks via `driver:'raf'`
- `usePaneInput` change handler gated on `mountedRef` to prevent state updates on unmounted components

### Bug fixes

- Buffer thumbnail/modal selection sync: thumbnail defers to modal when open; modal notifies thumbnail of buffer changes and open/close state
- Stream subscription correctly updated on buffer switch in modal (previously stale subscription remained)
- `paint()` no longer overwrites VideoDecoder output in stream mode
- Float textures (rgba16f/rgba32f) skip VP9 encoding and stay as raw pixels
- Worker bounces pool buffer after pixel conversion (was detaching ArrayBuffer mid-read)
- Keyframe forced on buffer switch in stream mode (decoder now starts immediately on switch)
- Texture readback moved to `endFrame()` — captures consistent fully-rendered content

Delivers the complete devtools dashboard with streaming buffer inspection, GPU metrics, and a React 19.2-compatible pane hook implementation.

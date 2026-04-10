---
"three-flatland": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22


## Changes

### API

- `FlatlandOptions.renderTarget` type widened from `WebGLRenderTarget` to renderer-agnostic `RenderTarget` — accepts any Three.js render target, not just WebGL ones
- `Flatland.renderTarget` getter/setter updated to the same `RenderTarget` type

### Docs

- New "Debug Controls" guide covering `@three-flatland/tweakpane` integration
- JSDoc examples updated: `new WebGLRenderTarget(...)` → `new RenderTarget(...)` with explicit import
- Loader and tilemap JSDoc labels updated from "Vanilla" to "Three.js" throughout

### Examples

- Plain Three.js examples moved from `examples/vanilla/` to `examples/three/` — all example pairs now live under `examples/three/` and `examples/react/`

`FlatlandOptions.renderTarget` now accepts the base `RenderTarget` type instead of the WebGL-specific subclass, enabling renderer-agnostic render-to-texture workflows.

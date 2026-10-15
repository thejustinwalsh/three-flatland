---
"three-flatland": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

### API changes

- `Flatland.renderTarget` type changed from `WebGLRenderTarget` to `RenderTarget` — use `import { RenderTarget } from 'three'` instead of `WebGLRenderTarget` when passing a render target to `Flatland`

### Examples

- All plain Three.js examples moved from `examples/vanilla/` to `examples/three/`; React examples remain under `examples/react/`
- All examples now include Tweakpane debug controls via `createPane({ scene })` for live stats and scene-specific parameter controls

### Documentation

- New "Debug Controls" guide covering Tweakpane integration for both vanilla Three.js and R3F
- Updated guides for Flatland, sprites, pass-effects, and loaders to reflect `RenderTarget` API and example restructuring
- Updated LLM prompt context files

### BREAKING CHANGES

- `FlatlandOptions.renderTarget` accepts `RenderTarget` instead of `WebGLRenderTarget`. Update any call sites that pass a `WebGLRenderTarget` to use `RenderTarget` from `three`.

`Flatland.renderTarget` now uses the renderer-agnostic `RenderTarget` type throughout, and plain Three.js examples have been reorganised into `examples/three/` to align with the established `three/` vs `react/` naming convention.

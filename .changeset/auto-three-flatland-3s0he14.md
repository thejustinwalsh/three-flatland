---
"three-flatland": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

**`Flatland` render target type updated to `RenderTarget`**

- `FlatlandOptions.renderTarget` now typed as `RenderTarget` instead of `WebGLRenderTarget` — use `import { RenderTarget } from 'three'` in your scene setup
- `Flatland.renderTarget` getter/setter updated to match

**Documentation**

- New "Debug Controls" guide covering the Tweakpane integration and per-example debug pane setup
- Updated guides (Flatland, sprites, pass-effects) and example pages (animation, tilemap, pass-effects)
- All loader and tilemap API docs updated: "vanilla usage" renamed to "Three.js usage" to match the reorganised `examples/three/` folder structure
- All examples reorganised from `examples/vanilla/` into `examples/three/` (Three.js) and paired with React Three Fiber counterparts in `examples/react/`

This release migrates the `renderTarget` API surface from WebGL-specific types to the renderer-agnostic `RenderTarget` and ships a comprehensive Debug Controls guide alongside a full restructure of the examples directory.

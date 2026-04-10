---
"three-flatland": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22


## What's Changed

### API

- `FlatlandOptions.renderTarget` type changed from `WebGLRenderTarget` to renderer-agnostic `RenderTarget`
- `Flatland.renderTarget` getter/setter now typed as `RenderTarget` — `WebGLRenderTarget` values remain compatible

### Documentation

- New "Debug Controls" guide covering `@three-flatland/tweakpane` integration (`createPane`, `usePane`, `usePaneInput`, stats monitoring)
- Example pages for animation and tilemap updated with debug controls usage
- Updated pass-effects, sprites, and flatland guides

### Examples

- Plain Three.js examples moved from `examples/vanilla/` to `examples/three/`
- "Vanilla" terminology replaced with "Three.js" throughout source docs and comments (loaders, tilemap classes, SkiaCanvas)

All plain Three.js examples now live under `examples/three/`; React Three Fiber examples remain under `examples/react/`.

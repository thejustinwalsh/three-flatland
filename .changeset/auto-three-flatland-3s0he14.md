---
"three-flatland": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

## Changes

### Renderer-agnostic render target

- `Flatland.renderTarget` type changed from `WebGLRenderTarget` to renderer-agnostic `RenderTarget` — enables use with both WebGL and WebGPU backends without a type cast
- JSDoc example updated: `new WebGLRenderTarget(...)` → `new RenderTarget(...)` with explicit import

### Documentation

- New "Debug Controls" guide covering `@three-flatland/tweakpane` integration with all example scenes
- Updated guides: Flatland, Pass Effects, Sprites, Animation, Tilemap — each now references the debug controls workflow
- All loader and tilemap JSDoc examples relabelled from "Vanilla usage" to "Three.js usage" (`SpriteSheetLoader`, `TextureLoader`, `TiledLoader`, `LDtkLoader`, `TileMap2D`)

### Examples restructure

- All plain Three.js examples moved from `examples/vanilla/` to `examples/three/` to match the `examples/react/` pairing convention
- Doc site example previews and import paths updated to reflect the new folder layout

`Flatland` now accepts a renderer-agnostic `RenderTarget` instead of `WebGLRenderTarget`, and the examples directory has been reorganised into `examples/three/` and `examples/react/` pairs.

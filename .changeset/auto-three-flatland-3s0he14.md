---
"three-flatland": minor
---

> Branch: feat-examples-tweakplane
> PR: https://github.com/thejustinwalsh/three-flatland/pull/22

## BREAKING CHANGES

- `FlatlandOptions.renderTarget` is now typed as `RenderTarget` (from `three`) instead of `WebGLRenderTarget`. Update any existing render-target code to `import { RenderTarget } from 'three'`.

## API changes

- `Flatland.renderTarget` getter/setter now uses the renderer-agnostic `RenderTarget` type — removes the implicit WebGL-only constraint

## Documentation

- Added Debug Controls guide covering Tweakpane integration with `createPane` / `wireSceneStats`
- Updated Animation, Pass Effects, and Tilemap example pages with debug controls usage
- Updated Flatland, Sprites, and Pass Effects guides

## Examples

- All plain Three.js examples moved from `examples/vanilla/` to `examples/three/` — the `examples/react/` structure is unchanged
- API docs and code comments updated from "Vanilla" to "Three.js" terminology throughout (`SpriteSheetLoader`, `TileMap2D`, `SkiaCanvas`)

Switches the Flatland render target type to the renderer-agnostic `RenderTarget`, adds a Debug Controls documentation guide, and reorganizes all plain Three.js examples under `examples/three/`.

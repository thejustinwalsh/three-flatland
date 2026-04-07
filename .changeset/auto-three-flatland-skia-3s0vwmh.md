---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

## New Package: `@three-flatland/skia`

Initial release of the Skia WASM integration package for Three.js.

### Core API

- `SkiaFont` — load TTF/OTF fonts; measure text, get glyph IDs, advance widths
- `SkiaTypeface` — ref-counted typeface handle; `atSize(n)` creates sized `SkiaFont` instances with caching
- `SkiaPaint` — stroke/fill paint with color, alpha, stroke width, join/cap, and multi-stop linear gradients
- `SkiaPath` — vector path construction (`moveTo`, `lineTo`, `cubicTo`, `arcTo`, etc.) with in-place boolean ops (union, intersect, difference, xor), simplification, and transformation
- `SkiaSVG` — SVG DOM load and render
- `SkiaShader` — Skia shader handle for advanced fills
- `SkiaTextBlob` — pre-shaped text blob for efficient repeated text rendering

### Drawing Nodes (Three.js scene graph)

- `SkiaImageNode` — draw raster images
- `SkiaLineNode` — draw lines
- `SkiaOvalNode` — draw ovals/circles
- `SkiaPathNode` — draw `SkiaPath` objects
- `SkiaPointsNode` — draw point sets
- `SkiaRectNode` — draw rectangles
- `SkiaSVGNode` — draw SVG content
- `SkiaTextNode` — draw text strings with a font and paint
- `SkiaVerticesNode` — draw custom vertex meshes
- `SkiaGroup` — group of drawing nodes composited onto a shared canvas
- `SkiaCanvas` (Three.js) — Three.js `Mesh` that hosts a Skia surface and blits it as a texture

### React / R3F Integration

- `<SkiaCanvas>` component — R3F-compatible canvas element with Skia surface
- `useSkia()` hook — access the active `SkiaContext` from within a canvas subtree
- `SkiaFontLoader` / `SkiaImageLoader` — R3F `useLoader`-compatible font and image loaders

### WebGL and WebGPU Backends

- WebGL 2 backend (`skia-gl.wasm`) — full GPU-accelerated Skia via WebGL
- WebGPU / Dawn backend (`skia-wgpu.wasm`) — experimental WebGPU rendering pipeline with `SkiaBlitPipeline` for alpha-correct compositing onto Three.js render targets
- GL state save/restore ensures Skia rendering does not corrupt Three.js WebGL state
- WASM URL override via `SKIA_WASM_URL_GL` / `SKIA_WASM_URL_WGPU` env vars (Vite/webpack define)

### Build and Distribution

- WASM binaries built from Skia (chrome/m147) via Zig + Emscripten; SIMD and exception handling enabled
- `prepack` script copies WASM binaries into `dist/` before npm publish
- `copy-wasm` bin helper for downstream consumers to copy WASM files into their public dir
- Vendored third-party Skia dependencies to avoid rate-limit issues during CI builds
- Optional Dawn dependency for WGPU shim generation in sync scripts

Initial release adds a full WebGL- and WebGPU-accelerated Skia 2D drawing API for Three.js, with both vanilla and React Three Fiber integration paths.

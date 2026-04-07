---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

## New Package: `@three-flatland/skia`

Introduces `@three-flatland/skia` — a Skia graphics library for Three.js and React Three Fiber, compiled from [Skia](https://skia.org/) (chrome/m147) to WebAssembly via Zig. Supports both WebGL and WebGPU (Dawn/Graphite) rendering backends.

### Core Skia API

- `SkiaFont` — load and use fonts for text rendering
- `SkiaPaint` — stroke/fill style with color, alpha, stroke width, blend mode, anti-alias; multi-stop linear gradients
- `SkiaPath` — vector path construction (move, line, arc, cubic/quadratic bezier, rect, oval, round rect); boolean ops (`op`, `opInto`), simplification (`simplify`, `simplifyInto`), transformation (`transform`, `transformInto`)
- `SkiaImage` — decode and draw raster images
- `SkiaSVG` — parse and render SVG documents
- `SkiaShader` — procedural shaders: fractal noise, turbulence, image tiling
- `SkiaTextBlob` — pre-shaped immutable text for efficient repeated drawing; supports explicit glyph positions
- `SkiaPathEffect` — dash, discrete, corner, compose, and sum path effects
- `SkiaColorFilter` — blend, matrix, compose, and linear-to-sRGB color filters
- `SkiaImageFilter` — blur, drop shadow, dilate, erode, compose, and color-filtered image filters
- `SkiaPicture` — record and replay drawing commands
- `SkiaPathMeasure` — measure path length and sample points/tangents along a path

### Three.js Scene Graph Nodes

All nodes extend `SkiaNode` and share paint props (color, alpha, strokeWidth, style, blendMode):

- `SkiaCanvas` — renders Skia drawing into a Three.js texture (WebGL or WebGPU backend)
- `SkiaGroup` — container node; applies transforms and clips to children
- `SkiaCircle`, `SkiaLine`, `SkiaOval`, `SkiaRect` — primitive shape nodes
- `SkiaPathNode` — renders a `SkiaPath` object
- `SkiaImageNode` — renders a `SkiaImage`
- `SkiaSVGNode` — renders a `SkiaSVG` document
- `SkiaTextNode` — renders a text string with a `SkiaFont`
- `SkiaTextPathNode` — renders text along a path
- `SkiaFontLoader`, `SkiaImageLoader`, `SkiaSVGLoader` — Three.js-compatible loaders usable with `useLoader()`

### React Three Fiber Integration

- `<SkiaCanvas>` — R3F wrapper for `<skiaCanvas>` that provides `SkiaContext` to children via React context; accepts an `onContextCreate` callback
- `SkiaReactContext` — React context for the nearest `SkiaContext`; can be consumed with `useSkiaContext()`
- `useSkiaContext()` — hook returning the nearest `SkiaContext` (from parent `<SkiaCanvas>` or global singleton)

### WebGPU Backend

- `SkiaBlitPipeline` — vertex-less WebGPU blit pipeline; composites Skia textures onto a destination with optional premultiplied alpha blending and automatic format conversion (RGBA→BGRA)
- Auto-generated WGPU struct and enum definitions bridging the WebGPU C API to WASM32
- Dawn/Graphite backend compiled for Emscripten compatibility

### WebGL Backend

- GL texture support in `SkiaCanvas` and `SkiaContext` for direct texture rendering
- Simplified GL context initialization and state management

### WASM / Build

- Skia compiled via Zig build system targeting WASM32; Skia submodule pinned to chrome/m147
- SIMD enabled; compiler optimizations and `wasm-opt` post-processing
- Custom `sjlj`-based exception handling runtime for WASM
- Custom font manager integrated into WASM build
- `HandleTable` with free-list for efficient handle reuse and memory management; `FinalizationRegistry`-based GC for all Skia objects
- Setup scripts: `setup.mjs`, `setup-skia.sh` (patch, sync deps, build WASM, install tools)

### Examples & Docs

- Vanilla Three.js and React Three Fiber Skia examples added to the monorepo dev server
- Skia guide and examples page added to the docs site

This release introduces the complete `@three-flatland/skia` package from initial WASM build through full Three.js/R3F scene graph integration with both WebGL and WebGPU rendering backends.

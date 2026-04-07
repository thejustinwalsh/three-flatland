---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

## New package: `@three-flatland/skia`

Lightweight Skia GPU rendering library for Three.js — Skia's core 2D engine compiled to ~1 MB WASM via Zig, targeting both WebGL2 and WebGPU backends.

### Core API (`@three-flatland/skia`)

- `Skia.init(renderer)` — initialize from a Three.js renderer (WebGL or WebGPU)
- `SkiaPaint` — fill/stroke paint with color, gradients, image filters, color filters, and path effects
- `SkiaPath` — vector path construction with boolean ops (union, intersect, difference, xor), simplification, and transformation; in-place mutation variants for all ops
- `SkiaFont` — font loading and metrics
- `SkiaImage` — image loading and sampling
- `SkiaDrawingContext` — imperative draw calls (rect, oval, circle, line, path, image, text, vertices)
- `SkiaShader` — SKSL runtime shaders and linear/radial gradient constructors
- `SkiaTextBlob` — shaped text blobs for efficient repeated rendering
- `SkiaImageFilter` — blur, color-matrix, drop-shadow, and compose filters
- `SkiaColorFilter` — color matrix, blend, and compose filters
- `SkiaPathEffect` — dash, corner, and 1D path effects
- Multi-stop linear gradient support in paint

### Three.js Scene Graph (`@three-flatland/skia/three`)

- `SkiaCanvas` — Three.js `Object3D` that owns a Skia surface and composites into the Three.js scene; supports alpha rendering and off-screen texture targets
- `SkiaBlitPipeline` — WebGPU compute/blit pipeline for zero-copy Skia→Three.js texture compositing
- `SkiaGroup` — grouping node for Skia draw calls
- Drawing nodes: `SkiaCircle`, `SkiaImageNode`, `SkiaLine`, `SkiaOval`, `SkiaPathNode`, `SkiaRect`, `SkiaSVGNode`, `SkiaTextNode`, `SkiaTextPathNode`
- Loaders: `SkiaFontLoader`, `SkiaImageLoader`, `SkiaSVGLoader`
- `SkiaNode` base class for custom draw nodes

### React / R3F (`@three-flatland/skia/react`)

- JSX type augmentation and hooks for use with React Three Fiber

### WASM / Build

- Skia compiled from source (chrome/m147) via Zig build system targeting WASM32
- Dual backends: WebGL2 (GL shim bridging WASM→browser WebGL) and WebGPU (Dawn, Emscripten-compatible)
- Auto-generated WGPU struct/enum bindings for correct WASM32 memory layout
- SIMD enabled; wasm-opt post-processing for size reduction
- Handle table with free-list for efficient WASM-side object lifecycle management
- Custom font manager and WASM exception handling (sjlj runtime)

### Examples & Docs

- Vanilla and React Skia examples added to the monorepo and docs site

This release introduces `@three-flatland/skia` as a new package — a CanvasKit alternative offering Skia's GPU-accelerated 2D rendering at a fraction of the WASM size, integrated directly into the Three.js scene graph with first-class WebGPU support.

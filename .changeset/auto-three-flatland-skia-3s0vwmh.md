---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

**New package: `@three-flatland/skia`** — Skia 2D graphics library compiled to WASM (via Zig), integrated with Three.js and React Three Fiber.

### Rendering backends

- WebGL (skia-gpu-gl) WASM backend for Skia rendering in WebGL contexts
- WebGPU / Dawn WASM backend for Skia rendering in WebGPU contexts, with Emscripten compatibility
- `SkiaBlitPipeline` — WebGPU blit pass that composites Skia textures into Three.js scenes with alpha support
- GL texture support in `SkiaCanvas` for direct render-to-texture

### Three.js scene graph nodes

- `SkiaCanvas` — Three.js object wrapping a Skia surface; renders to a WebGPU/GL texture each frame
- `SkiaGroup` — container for Skia draw nodes, mirrors Three.js `Group` semantics
- `SkiaNode` / `SkiaPaintProps` — base class and shared paint-property mixin for all draw nodes
- Drawing primitives: `SkiaCircle`, `SkiaLine`, `SkiaOval`, `SkiaRect`
- Path-based nodes: `SkiaPathNode`, `SkiaTextPathNode`
- Image nodes: `SkiaImageNode`, `SkiaSVGNode`
- Text node: `SkiaTextNode`
- Vertex / points nodes: `SkiaVerticesNode`, `SkiaPointsNode` (later consolidated)
- Loaders: `SkiaFontLoader`, `SkiaImageLoader`, `SkiaSVGLoader`

### TypeScript API

- `SkiaFont`, `SkiaPaint`, `SkiaPath`, `SkiaSVG` — high-level wrappers around Skia objects
- `SkiaShader`, `SkiaTextBlob` — shader and text-blob construction helpers
- `SkiaImage`, `SkiaColorFilter`, `SkiaImageFilter`, `SkiaPathEffect`, `SkiaPicture`, `SkiaPathMeasure` — full Skia object model
- `SkiaDrawingContext` — imperative drawing API
- In-place path operations: boolean ops (`op`), simplification, affine transforms
- Multi-stop linear gradient support via `SkiaPaint`
- `initSkia` / `preloadSkia` — async WASM initialization and asset preloading

### React / R3F integration

- `<SkiaCanvas>` React component with automatic context wiring for R3F scenes
- `SkiaContext` / `useSkia` hook — access the initialized Skia API from any child component
- `attach` helper for attaching Skia draw nodes to an R3F scene graph
- Exported from `@three-flatland/skia/react`

### Build & distribution

- Dual WASM distribution: `dist/skia-gl/skia-gl.wasm` (WebGL) and `dist/skia-wgpu/skia-wgpu.wasm` (WebGPU)
- Debug/ReleaseFast/ReleaseSmall/opt WASM variants excluded from published package
- `prepack` script validates all required artifacts before `npm publish`; blocks CI publish if any artifact is missing
- WASM built with SIMD enabled and Zig optimizer flags for production builds
- Custom font manager and WASM exception-handling (SjLj) runtime
- Efficient handle-table with free-list for WASM-side object lifecycle management
- Setup scripts (`setup.mjs`, `setup-skia.sh`) for Skia source extraction, patching, and GN configuration; `install-wasm-tools.sh` includes `wasm-opt`

This release introduces the `@three-flatland/skia` package, providing a complete Skia 2D vector graphics API for Three.js and React Three Fiber via dual WebGL/WebGPU WASM backends.

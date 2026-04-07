---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

### Initial Release — GPU-accelerated Skia for Three.js

**New package:** `@three-flatland/skia` — Skia compiled to WASM via Zig, providing GPU-accelerated 2D vector graphics inside Three.js scenes. Lighter than CanvasKit (~857 KB brotli vs ~2.2 MB).

**Core API (`@three-flatland/skia`)**
- `Skia.init(renderer)` — auto-detects WebGPU (Graphite/Dawn) or WebGL (Ganesh) from any Three.js renderer, raw `WebGL2RenderingContext`, or `GPUDevice`
- `Skia.preload()` — optional prefetch for faster first-frame initialization
- `SkiaContext` — owns the WASM instance and GPU binding; singleton per application
- `SkiaDrawingContext` — immediate-mode drawing API (rects, circles, ovals, lines, paths, images, text)
- `SkiaPaint` — fill/stroke style with color, alpha, stroke width, blend mode, anti-alias, image filters, color filters, shaders
- `SkiaPath` — vector paths with move/line/cubic/arc/oval/rect/addPath; boolean ops (union, intersect, difference, XOR), simplify, stroke, dash
- `SkiaFont` / `SkiaTypeface` — FreeType font loading (TTF/OTF), metrics, text measurement, ref-counted typefaces
- `SkiaShader` — linear, radial, and sweep gradients with multi-stop support; Perlin noise; image tiling; compose
- `SkiaImageFilter` — blur, drop shadow, morphology, displacement, color matrix
- `SkiaColorFilter` — blend, matrix, and compose color filters
- `SkiaPathEffect` — dash, 1D/2D path stamping, corner rounding, discrete, compose
- `SkiaImage` — load and draw raster images
- `SkiaPathMeasure` — measure path length, get position/tangent at distance
- `SkiaTextBlob` — shaped text blobs for efficient repeated rendering
- `SkiaPicture` / `SkiaPictureRecorder` — record and replay draw calls

**Three.js scene graph (`@three-flatland/skia/three`)**
- `SkiaCanvas` — `Object3D` that owns a render target and blits Skia output as a `Texture`; supports both WebGL FBO and WebGPU blit pipeline with GL state save/restore
- `SkiaGroup` — `Object3D` group for organizing drawing nodes
- Shape nodes as `Object3D` children: `SkiaRect`, `SkiaCircle`, `SkiaOval`, `SkiaLine`, `SkiaPathNode`, `SkiaTextNode`, `SkiaTextPathNode`, `SkiaImageNode`
- `SkiaFontLoader` / `SkiaImageLoader` — async loaders for fonts and images, compatible with R3F `useLoader`

**React Three Fiber (`@three-flatland/skia/react`)**
- `<SkiaCanvas>` — R3F component that manages the Skia context and exposes a `SkiaCanvasRef`
- `useSkiaContext()` — hook to access the `SkiaContext` from any child
- `attachSkiaTexture` — R3F attach helper for binding the canvas output to `material.map`
- `SkiaReactContext` — React context provider wrapping the Three.js canvas
- Full JSX type augmentation for all shape nodes (`<skiaRect>`, `<skiaCircle>`, etc.)
- Compatible with `useLoader(SkiaFontLoader, url)` for font loading in R3F

**WASM backends**
- `@three-flatland/skia/wasm/gl` — WebGL (Ganesh) WASM bundle (~1 MB brotli)
- `@three-flatland/skia/wasm/wgpu` — WebGPU (Graphite/Dawn) WASM bundle (~857 KB brotli); includes auto-generated WGPU struct definitions for WASM32
- SIMD enabled; Emscripten exception handling; `wasm-opt` applied in release builds

**Build infrastructure**
- `prepack` script copies WASM artifacts before publish
- `bin/copy-wasm.mjs` for post-install WASM setup in Vite projects (zero config required)
- Vendor scripts for third-party deps; Dawn patches for Emscripten compatibility

Initial alpha release (`0.0.1-alpha.0`) of a new package providing Skia WASM GPU-accelerated 2D vector graphics for Three.js, with full WebGL and WebGPU backends, a Three.js scene graph API, and React Three Fiber integration.

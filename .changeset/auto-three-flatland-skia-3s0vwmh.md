---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

**Initial release** of `@three-flatland/skia` — GPU-accelerated 2D vector graphics via Skia compiled to WebAssembly with Zig, pinned to Skia chrome/m147.

### Package & Build

- New `@three-flatland/skia` package: ~1 MB brotli (vs 2.9 MB CanvasKit), dual ESM/CJS output
- Zig-based WASM build pipeline targeting `wasm32-freestanding`; SIMD and size-optimizing compiler flags enabled
- Setup scripts (`skia:setup`) install Zig, wasm-tools, wit-bindgen, and wasm-opt locally to `.tools/` with SHA256 verification
- WASM exception handling via custom `wasm_sjlj_rt.c` runtime; custom font manager replaces Emscripten's
- Handle table with free-list for efficient WASM-side object lifetime tracking

### WebGL Backend

- Skia Ganesh GL backend wired to WebGL2 via a generated Emscripten-compatible GL shim
- Auto-generated JS GL host satisfies all WASM WebGL imports without Emscripten
- GL context initialization simplified; error handling added for context creation failures

### WebGPU Backend

- Skia Dawn backend compiled for `wasm32` with Emscripten compatibility shim
- Auto-generated WGPU struct/enum bridge (`wgpu-structs.generated.ts`, `wgpu-enums.generated.ts`) for WASM32 ABI
- `SkiaContext` backend selection: `"gl"` or `"webgpu"` via `SkiaContextOptions`

### Core Drawing API (`@three-flatland/skia`)

- `Skia.init(renderer | gl)` — initialize with a Three.js renderer or a raw `WebGL2RenderingContext`
- `SkiaContext` — wraps GL/WebGPU context; exposes `drawToFBO()` for render-to-texture
- `SkiaPaint` — fill/stroke, color, anti-alias, blend mode, stroke cap/join/width/miter
- `SkiaPath` — moveTo, lineTo, cubicTo, quadTo, arcTo, addRect/RRect/Circle/Oval, boolean path ops (union, intersect, difference, XOR) with in-place variants, simplify, transform
- `SkiaFont` — load TTF/OTF from `ArrayBuffer`; measure text, get glyph IDs and widths, font metrics
- `SkiaDrawingContext` — imperative draw calls: rect, rrect, circle, oval, path, image, text, text-on-path, vertices, picture
- `SkiaImageFilter` — blur, drop shadow, offset, morphology, displacement map, blend, matrix transform, compose
- `SkiaColorFilter` — blend, 4x5 color matrix, lerp, luma, per-channel LUT, gamma correction
- `SkiaShader` — Perlin noise (fractal/turbulence), image tiling, linear/radial/sweep/two-point-conical gradients, multi-stop support, solid color, blend
- `SkiaPathEffect` — dash, corner rounding, discrete jitter, trim, 1D/2D path stamps, compose
- `SkiaPathMeasure` — arc-length queries, point/tangent at distance, segment extraction
- `SkiaTextBlob` — build text blobs for efficient text rendering; text-on-path layout
- `SkiaPicture` / `SkiaPictureRecorder` — record drawing commands for immutable replay
- `SkiaImage` — draw raster images, rect cropping/scaling, browser-native decoding

### Three.js Scene Graph (`@three-flatland/skia/three`)

- `SkiaCanvas` — `Object3D` that owns a Skia render surface; mounts into any Three.js scene or R3F `<Canvas>`
- `SkiaGroup` — grouping node with clip support
- Shape nodes: `SkiaRect`, `SkiaCircle`, `SkiaOval`, `SkiaLine`, `SkiaPathNode`, `SkiaImageNode`, `SkiaTextNode`, `SkiaTextPathNode`, `SkiaSVGNode`
- `SkiaFontLoader` / `SkiaImageLoader` — Three.js loaders for fonts and images
- `SkiaPaintProps` — declarative paint properties for all shape nodes
- R3F JSX type augmentation via `@three-flatland/skia/react` side-effect import

### Examples & Docs

- Vanilla Three.js and React Three Fiber Skia examples added (`examples/vanilla/skia`, `examples/react/skia`)
- Skia examples page added to documentation site
- 152 Vitest tests (~90% coverage) validate API against the real WASM binary

Initial release of `@three-flatland/skia`: a lightweight, GPU-accelerated Skia binding (~1 MB brotli) with WebGL2 and WebGPU backends, a full drawing API, and a declarative Three.js/R3F scene graph integration.

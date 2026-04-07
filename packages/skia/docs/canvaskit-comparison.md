# CanvasKit vs @three-flatland/skia

Both ship Skia compiled to WebAssembly. CanvasKit is Google's official build via Emscripten. We compile with Zig, targeting a smaller binary focused on the core 2D drawing API.

## What We Include

The core Skia drawing API: paths, fills, strokes, gradients, image filters, color filters, path effects, shaders, text (FreeType + HarfBuzz), path boolean operations, SVG paths, and picture recording.

## What We Exclude

| Feature | Size Impact | Why Excluded |
|---|---|---|
| **CPU Fallback** | — | GPU-only; WebGL2 is universal |
| **Full SVG Rendering** | — | Only SVG paths; full SVG DOM excluded |
| **Brotli (WOFF2)** | ~50 KB gz | Use TTF/OTF instead |
| **Paragraph Layout (skparagraph)** | ~150 KB gz | Use browser layout for paragraph text |
| **Internationalization (ICU)** | ~400 KB gz | Unicode tables; biggest single saving |
| **Lottie Animations (Skottie)** | ~200 KB gz | Use a dedicated Lottie player |
| **Image Codecs (PNG/JPEG/WebP)** | ~150 KB gz | Browser decodes natively |
| **Canvas: drawPoints** | — | Use paths for point rendering |
| **Canvas: drawVertices** | — | Use Three.js for geometry |
| **Canvas: drawAtlas** | — | Use Three.js for sprite batching |
| **Canvas: drawPatch (Coons)** | — | Niche; not in scope |
| **Shader: SkSL runtime effects** | — | Custom shader runtime; not in scope |
| **ImageFilter: runtime shader** | — | Depends on SkSL |

## What We Add

| Feature | Why |
|---|---|
| **WebGPU Backend (Graphite/Dawn)** | CanvasKit's npm package ships WebGL only |
| **WASM SIMD** | 96% browser support; CanvasKit disables it. Accelerates path tessellation and color math |
| **Native WASM exceptions** | Smaller than Emscripten's JS-based setjmp shim |
| **wasm-opt post-processing** | Whole-program dead code elimination + size optimization |
| **Three.js scene graph** | Object3D nodes, loaders, R3F JSX — CanvasKit has no framework integration |

## Size Comparison

Measured from `canvaskit-wasm@0.41.0` on npm vs our build output.

| | Unpacked | Gzipped | Brotli |
|---|---|---|---|
| **CanvasKit** | 6.8 MB | 2,828 KB | 2,192 KB |
| **skia (WebGL)** | 3.2 MB | 1,277 KB | 1,024 KB |
| **skia (WebGPU)** | 2.6 MB | 1,065 KB | 857 KB |

| | vs CanvasKit |
|---|---|
| **WebGL** | 53% smaller (brotli) |
| **WebGPU** | 61% smaller (brotli) |

## Compiler

| | CanvasKit | @three-flatland/skia |
|---|---|---|
| **Toolchain** | Emscripten (emcc) | Zig (clang backend) |
| **Optimization** | Default release | ReleaseSmall (`-Oz`) |
| **Post-link optimizer** | None | wasm-opt `-Oz` |

## WASM Features

| Feature | CanvasKit | @three-flatland/skia |
|---|:---:|:---:|
| **SIMD (128-bit)** | Disabled | Enabled |
| **Tail Call** | Disabled | Enabled |
| **setjmp/longjmp** | Emscripten JS shim | Native WASM exception instructions |

## Compiler Flags

| Flag | CanvasKit | @three-flatland/skia | Purpose |
|---|:---:|:---:|---|
| `-fno-math-errno` | No | Yes | Skip errno checks on math calls |
| `-fno-signed-zeros` | No | Yes | Treat -0.0 as +0.0 |
| `-ffp-contract=fast` | Off | Yes | Allow fused multiply-add |
| `-DSKVX_DISABLE_SIMD` | Yes | No | We enable WASM SIMD |

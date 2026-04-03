# CanvasKit vs @three-flatland/skia

Both ship Skia compiled to WebAssembly. CanvasKit is Google's official build via Emscripten. We compile with Zig, targeting a smaller binary with only the features needed for 2D vector graphics.

## Feature Matrix

| Feature | CanvasKit | @three-flatland/skia |
|---|:---:|:---:|
| **GPU Rendering (Ganesh/WebGL)** | Yes | Yes |
| **WebGPU (Graphite)** | Yes | Planned |
| **CPU Fallback** | Yes | No |
| **Path Rendering** | Yes | Yes |
| **PathOps (boolean operations)** | Yes | Yes |
| **SVG Rendering** | Yes | Yes |
| **FreeType Glyph Rendering** | Yes | Yes |
| **WOFF2 Font Loading** | Yes (brotli) | No (TTF/OTF only) |
| **Text Shaping (HarfBuzz)** | Yes | No |
| **Paragraph Layout (skparagraph)** | Yes | No |
| **Internationalization (ICU)** | Yes | No |
| **Lottie Animations (Skottie)** | Yes | No |
| **Image Codecs (PNG/JPEG/WebP)** | Yes | No |
| **PDF Output** | No | No |
| **WASM SIMD** | No | Yes |

## Size Comparison

Measured from `canvaskit-wasm@0.41.0` on npm vs our build output.

| | Unpacked | Gzipped | Brotli |
|---|---|---|---|
| **CanvasKit** | 6.8 MB | 2,828 KB | 2,192 KB |
| **@three-flatland/skia** | 3.1 MB | 1,247 KB | 1,002 KB |
| **Savings** | 55% smaller | 56% smaller | 54% smaller |
| **Fraction** | 0.45x | 0.44x | 0.46x |

Run `node scripts/compare-builds.mjs` to regenerate these numbers.

## Build & Optimization Choices

### Compiler

| | CanvasKit | @three-flatland/skia |
|---|---|---|
| **Toolchain** | Emscripten (emcc) | Zig (clang backend) |
| **Optimization** | Default release | ReleaseSmall (`-Oz`) |
| **Post-link optimizer** | None | wasm-opt `-Oz` |

### WASM Features

| Feature | CanvasKit | @three-flatland/skia |
|---|:---:|:---:|
| **SIMD (128-bit)** | Disabled | Enabled |
| **Tail Call** | Disabled | Enabled |
| **setjmp/longjmp** | Emscripten JS shim | Native WASM exception instructions |

### Compiler Flags

| Flag | CanvasKit | @three-flatland/skia | Purpose |
|---|:---:|:---:|---|
| `-fno-math-errno` | No | Yes | Skip errno checks on math calls |
| `-fno-signed-zeros` | No | Yes | Treat -0.0 as +0.0 |
| `-ffp-contract=fast` | Off | Yes | Allow fused multiply-add |
| `-DSKVX_DISABLE_SIMD` | Yes | No | We enable WASM SIMD |
| `-DSK_DISABLE_TRACING` | Yes | Yes | Both disable in release |

### What We Exclude and Why

| Excluded Feature | Size Cost | Why |
|---|---|---|
| **Skottie (Lottie)** | ~200 KB gz | Lottie animations — likely future inclusion |
| **Skparagraph** | ~150 KB gz | Structured paragraph text — Size, nncommon, painful api |
| **ICU** | ~400 KB gz | Unicode tables for internationalization — Size |
| **HarfBuzz** | ~100 KB gz | Complex text shaping (Arabic, Devanagari, etc.) -- Size |
| **Image codecs** | ~150 KB gz | PNG/JPEG/WebP — browser polyfills |
| **Brotli** | ~50 KB gz | WOFF2 decompression — use TTF/OTF instead |

Total savings: About 50% by excluding features the browser already provides or that aren't needed for core 2D vector graphics.

### What We Add

| Addition | Why |
|---|---|
| **WASM SIMD** | 96% browser support — accelerates path tessellation and color math |
| **Fast math flags** | Safe for graphics — no code checks math errno or signed zeros |
| **FMA contraction** | Skia disables for cross-platform consistency; we take the slight differences if any |
| **Native WASM exceptions** | Smaller than Emscripten's JS-based setjmp shim |
| **wasm-opt post-processing** | Whole-program dead code elimination + size optimization |

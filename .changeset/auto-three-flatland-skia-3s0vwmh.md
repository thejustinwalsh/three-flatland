---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

**New package: `@three-flatland/skia`** — lightweight Skia GPU rendering in ~1 MB of WASM, built with Zig, targeting both WebGL2 and WebGPU backends.

### WebGL backend
- GPU-accelerated GL pipeline via Skia's OpenGL backend
- JS GL host bridging WASM WebGL imports to the browser WebGL2 context
- Skia GL context creation with full WebGL state save/restore around draws
- Simplified GL context initialization and state management

### WebGPU (Dawn) backend
- Full WebGPU backend via Dawn/Emscripten shim, with Emscripten compatibility patches
- `SkiaBlitPipeline` — composites Skia-rendered textures into the Three.js scene with alpha support and render-to-texture
- Auto-generated WGPU struct and enum definitions for WASM32 ABI

### Drawing API
- `SkiaPaint` — stroke, fill, color, alpha, blend modes, anti-alias, multi-stop linear gradients
- `SkiaPath` — path construction, boolean ops (union, intersect, diff, xor), simplification, in-place transformation
- `SkiaTypeface` — TTF/OTF font data handle; call `.atSize(n)` to create a sized `SkiaFont`
- `SkiaFont` — sized font with glyph metrics, text measurement, and glyph ID lookup; factory: `SkiaFont.fromData()`
- `SkiaSVG` — SVG document loading and rendering
- `SkiaImage` — image loading and drawing
- `SkiaShader` — runtime effect (SKSL) shaders
- `SkiaTextBlob` — batched glyph draw calls for efficient text rendering
- Color filters, image filters, path effects, path measure

### Three.js scene graph
- `SkiaCanvas` — Three.js `Object3D` that owns a Skia surface, renders to a WebGL texture or WebGPU texture
- `SkiaGroup` — scene container managing draw order of child Skia nodes
- Primitive nodes: `SkiaRect`, `SkiaOval`, `SkiaCircle`, `SkiaLine`
- `SkiaPathNode`, `SkiaTextPathNode` — path-based scene nodes
- `SkiaTextNode` — text rendering scene node
- `SkiaImageNode` — image scene node
- `SkiaSVGNode` — SVG scene node
- `SkiaFontLoader`, `SkiaImageLoader`, `SkiaSVGLoader` — Three.js `Loader`-compatible loaders for R3F `useLoader`

### React / R3F integration
- `<SkiaCanvas>` component — provides a `SkiaContext` via React context
- `useSkiaContext()` hook — suspense-aware; always returns a ready `SkiaContext`, never null; uses React `use()` to suspend during WASM init

### Font handling improvements
- `SkiaFontLoader` now returns `SkiaTypeface`; call `.atSize(n)` to get a sized `SkiaFont` (decouples load from size)
- Ref-counted typeface handles with `FinalizationRegistry` for GC-safe cleanup
- Per-context dedup cache — multiple fonts at different sizes share a single typeface upload

### WASM URL override
- `SKIA_WASM_URL_GL` / `SKIA_WASM_URL_WGPU` env vars (Vite `define` or webpack `DefinePlugin`) override the default WASM asset URL at build time

### Build & tooling
- Zig-based WASM build pipeline for both WebGL and WebGPU backends with SIMD and compiler optimizations
- `prepack` script verifies all required dist artifacts before `npm publish`; fails fast in CI if build step was skipped
- `skia-wasm` bin helper (`npx skia-wasm`) copies bundled WASM files to a project's `public/` directory
- FreeType, HarfBuzz, and Expat sources vendored to avoid network rate limits during build
- `scripts/setup.mjs --ensure` downloads pre-built WASM when Zig toolchain is unavailable

Initial release of the `@three-flatland/skia` package, introducing a full Skia GPU rendering pipeline for Three.js and React Three Fiber with WebGL2 and WebGPU backends, a complete 2D drawing API, and suspense-aware React hooks.

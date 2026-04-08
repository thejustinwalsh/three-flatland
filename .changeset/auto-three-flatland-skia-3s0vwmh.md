---
"@three-flatland/skia": minor
---

> Branch: feat-skia
> PR: https://github.com/thejustinwalsh/three-flatland/pull/19

**Initial release** of `@three-flatland/skia` — Skia-powered 2D vector rendering integrated with Three.js (WebGL and WebGPU).

**WASM build & backends**
- Skia compiled to WASM via Zig (chrome/m147), targeting both WebGL2 and WebGPU (Dawn)
- WebGL backend: JS GL host shim bridges WASM imports to browser WebGL2 API
- WebGPU backend: Dawn-based, Emscripten-compatible; auto-generated WGPU struct/enum bindings
- SIMD enabled; WASM optimized with wasm-opt and compiler flags
- WASM URL overridable at build time via `SKIA_WASM_URL_GL` / `SKIA_WASM_URL_WGPU` env vars

**Core drawing API**
- `SkiaPaint` — fill/stroke with color, gradient (multi-stop linear), image filter, color filter, shader, path effect, blend mode, anti-alias, stroke width/cap/join
- `SkiaPath` — contour construction, boolean ops (union/intersect/difference/xor), simplification, in-place transforms
- `SkiaImage` — load from URL or bytes; `SkiaImageLoader` for Three.js/R3F `useLoader`
- `SkiaSVG` — load and render SVG documents; `SkiaSVGLoader` for Three.js/R3F `useLoader`
- `SkiaShader` — runtime-effect shaders and gradient factories
- `SkiaTextBlob` — shaped text for high-performance text drawing
- `SkiaColorFilter`, `SkiaImageFilter`, `SkiaPathEffect`, `SkiaPicture` — full filter/effect pipeline

**Font API**
- `SkiaTypeface` — ref-counted, deduplicated typeface handle loaded from TTF/OTF bytes; call `.atSize(n)` to get a sized `SkiaFont`
- `SkiaFont` — typeface at a specific point size; supports `measureText`, `getGlyphWidths`, `getMetrics`
- `SkiaFontLoader` — Three.js `Loader` compatible with R3F `useLoader`; returns `SkiaTypeface` cached by URL; context resolved lazily from singleton
- `SkiaTypeface.fromURL(ctx, url)` — standalone async loader

**Three.js scene graph**
- `SkiaCanvas` — `Object3D` that owns a Skia drawing surface; two render modes:
  - _Texture mode_: renders Skia into a `WebGLRenderTarget` / `GPUTexture` for use as a Three.js material texture
  - _Overlay mode_: alpha-blends Skia output directly onto the canvas after the 3D scene
- `SkiaGroup` — transform, clip, and effects container; uses standard `Object3D` `position`/`scale`/`rotation.z`
- Drawing nodes: `SkiaCircle`, `SkiaImageNode`, `SkiaLine`, `SkiaOval`, `SkiaPathNode`, `SkiaRect`, `SkiaSVGNode`, `SkiaTextNode`, `SkiaTextPathNode`
- `SkiaImageLoader` — load images for use in drawing nodes
- `SkiaBlitPipeline` — internal WebGPU blit pipeline (BGRA to RGBA format conversion, premultiplied alpha blend)

**React (R3F) integration**
- `<SkiaCanvas>` React component — wraps `SkiaCanvas` as a declarative R3F element with a React context provider
- `useSkia()` — access the `SkiaContext` from any child component
- `useSkiaFrame(callback)` — run a drawing callback every frame inside a Skia canvas
- Full JSX type augmentation for all Three.js Skia nodes

**Infrastructure**
- `prepack` script copies built WASM artifacts into package before `npm publish`
- Vendored freetype, harfbuzz, and expat sources for reproducible builds (avoids external rate limits)
- Dawn patches for `DawnBuffer` constexpr logging and `Depth16Unorm` stencil format compatibility
- Sync scripts support optional Dawn dependency for WGPU shim generation

## BREAKING CHANGES

- `SkiaFontLoader` now returns `SkiaTypeface` instead of `SkiaFont`. Call `.atSize(n)` on the result to get a sized font.
- `SkiaFontLoader.load(url, options?)` no longer accepts a `size` option; the cache key is now the URL alone (not `url:size`).
- `SkiaFontLoader.preload(urls)` no longer accepts an options argument.
- `SkiaCanvas.render()` no longer accepts a `renderer` argument; the renderer is stored internally at initialization time.

Initial release introducing full Skia 2D rendering for Three.js with WebGL2 and WebGPU backends, a complete drawing API, React/R3F integration, and an npm-publishable package structure.

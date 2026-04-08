---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New package: `@three-flatland/slug`

GPU-accelerated, resolution-independent text rendering for Three.js using the Slug algorithm. Glyphs are evaluated as quadratic Bezier curves directly in the fragment shader — no SDF atlas, no bitmap textures.

### Core API

- `SlugFont` — loads TTF/OTF/WOFF fonts, parses glyph outlines, builds GPU `DataTexture` atlases
- `SlugText` — `InstancedMesh` subclass; set `.text`, `.fontSize`, `.align`, call `.update()`
- `SlugMaterial` — `MeshBasicNodeMaterial` with TSL vertex + fragment shaders; compiles to WGSL (WebGPU) and GLSL ES 3.0 (WebGL2 fallback)
- `SlugGeometry` — instanced quad geometry with 5× `vec4` per-glyph instance attributes

### Rendering pipeline

- `fontParser` — parses glyph outlines into quadratic Bezier curves; cubics split into 4 quadratics via De Casteljau; lines converted to degenerate quadratics with correctly scaled `LINE_EPSILON` (in em-space units)
- `bandBuilder` — partitions curves into horizontal/vertical spatial bands for fast per-pixel lookup
- `texturePacker` — packs curves and bands into power-of-two GPU textures with endpoint sharing
- `textShaper` — maps a string to positioned glyphs with kerning and alignment

### Shaders (TSL)

- `slugVertex` — instanced quad positioning; per-glyph em-space coordinates passed via varyings; per-glyph band counts encoded in `glyphJac.zw`
- `slugFragment` — dual-axis ray casting with winding number evaluation for antialiased coverage
- `slugDilate` — dynamic screen-space quad dilation for sub-pixel edge coverage (authored, not yet active)
- `calcCoverage`, `calcRootCode`, `solveQuadratic` — supporting math nodes

### Fixes

- Glyph quad sizing corrected: bounds are in normalized em-space so `fontSize` (not `scale`) drives object-space dimensions
- `instanceMatrix` buffer resized and pre-filled with identity matrices to prevent invisible geometry
- Camera projection updated to 1 unit = 1 CSS pixel so `fontSize` matches browser text sizing

### Example

- `examples/vanilla/slug-text` — interactive demo with font-size picker, HTML overlay toggle (`H` key), and baseline alignment sync for side-by-side browser vs. Slug comparison

Introduces `@three-flatland/slug` as a new package providing resolution-independent GPU text rendering. Supports `WebGPURenderer` with both WebGPU and WebGL2 backends via TSL.

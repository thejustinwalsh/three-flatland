---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

## New package: `@three-flatland/slug`

GPU-accelerated, resolution-independent text rendering for Three.js using the [Slug algorithm](https://sluglibrary.com/). Glyphs are evaluated as quadratic Bezier curves directly in the fragment shader — no SDF atlas, no bitmap textures.

### Core API

- `SlugFont` — loads TTF/OTF/WOFF fonts; parses glyph outlines into GPU-ready `DataTexture` pairs (curve texture + band texture)
- `SlugText` — `InstancedMesh` subclass; set `.text`, `.fontSize`, `.align` and call `.update(camera)` each frame
- `SlugMaterial` — `MeshBasicNodeMaterial` with TSL vertex + fragment shaders; compiles to WGSL (WebGPU) and GLSL ES 3.0 (WebGL2)
- `SlugGeometry` — instanced quad geometry with five `vec4` per-glyph instance attributes

### Rendering pipeline

- `fontParser` — parses glyph outlines; lines converted to degenerate quadratics with correctly scaled `LINE_EPSILON` (font units × `1/unitsPerEm`); cubic Beziers split into four quadratics via De Casteljau for improved accuracy
- `bandBuilder` — partitions curves into horizontal/vertical spatial bands for fast GPU lookup
- `texturePacker` — packs curves and bands into power-of-two `DataTexture`s with endpoint sharing to reduce texture size
- `textShaper` — maps strings to positioned glyphs with kerning and alignment

### Shaders (TSL)

- Vertex: instanced quad positioning with dynamic half-pixel dilation (`slugDilate`) — expands each quad vertex outward in screen space to prevent edge clipping artifacts; MVP matrix rows passed as uniforms via `SlugMaterial.updateMVP(object, camera)`
- Fragment: dual-axis ray casting evaluates winding number per pixel; fractional coverage produces smooth anti-aliasing without supersampling
- Per-glyph band counts packed into `glyphJac` instance attribute (z/w components) and forwarded to the fragment shader via varyings

### `SlugText.update()` signature change

`update()` now accepts an optional `Camera` parameter to update MVP uniforms for vertex dilation each frame. Calling without a camera skips dilation updates.

### Other

- `SlugGeometry.capacity` getter exposed
- `instanceMatrix` auto-initialized with identity matrices on rebuild to prevent invisible glyphs
- React Three Fiber entry point (`three-flatland/slug/react`) with JSX type augmentation stubs
- Unit tests for `bandBuilder`, `fontParser`, `texturePacker`, and reference shader logic
- `docs/ARCHITECTURE.md` and `docs/REFERENCE.md` with full algorithm walkthrough and API reference

Initial release of `@three-flatland/slug` — GPU text rendering via the Slug algorithm, targeting `WebGPURenderer` (WebGPU and WebGL2 fallback). Supports TTF, OTF, and WOFF fonts with a minimal two-class API.

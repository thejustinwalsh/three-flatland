# @three-flatland/slug

GPU-accelerated, resolution-independent text rendering for [Three.js](https://threejs.org/) using the [Slug algorithm](https://sluglibrary.com/).

Slug evaluates quadratic Bezier curves directly in the fragment shader. No SDF atlas, no bitmap textures, no resolution ceiling. Text stays sharp at any size, any zoom, any perspective.

## Highlights

- **Pixel-perfect at every scale** -- glyphs are mathematically evaluated per-pixel, not sampled from a texture
- **WebGPU + WebGL2** -- TSL (Three Shader Language) compiles to both WGSL and GLSL ES 3.0
- **Instanced rendering** -- thousands of glyphs in a single draw call
- **Zero precomputation** -- load a TTF/OTF font, render immediately
- **Tiny API surface** -- `SlugFont`, `SlugText`, done

## Quick Start

```bash
pnpm add @three-flatland/slug three
```

```ts
import { SlugFont, SlugText } from '@three-flatland/slug'

// Load a font
const font = await SlugFont.fromURL('/fonts/Inter-Regular.ttf')

// Create text
const text = new SlugText(font, 'Hello, Slug!', {
  fontSize: 48,
  color: 0xffffff,
  align: 'center',
})
scene.add(text)

// Call once per frame (rebuilds only when dirty)
text.update()
```

Change text at runtime:

```ts
text.text = 'New content'
text.fontSize = 96
text.align = 'right'
text.update()
```

## How It Works

```
TTF/OTF font file
       |
       v
  [fontParser]     Parse glyph outlines into quadratic Bezier curves
       |
       v
  [bandBuilder]    Partition curves into spatial bands for fast lookup
       |
       v
  [texturePacker]  Pack curves + bands into GPU DataTextures (pow2)
       |
       v
  [textShaper]     String -> positioned glyphs (kerning, alignment)
       |
       v
  [SlugMaterial]   TSL vertex + fragment shaders
       |              vertex:   instanced quad positioning
       |              fragment: dual-ray winding number evaluation
       v
  Rendered text     Anti-aliased, resolution-independent
```

The fragment shader casts two rays (horizontal + vertical) per pixel, solves quadratic equations to find curve intersections, and computes a winding number for inside/outside determination. Fractional coverage produces smooth anti-aliasing without supersampling.

For the full algorithm walkthrough, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## API

| Export | Description |
|--------|-------------|
| `SlugFont` | Font data container. Holds parsed glyphs, GPU textures, and text shaping. |
| `SlugText` | High-level `InstancedMesh` subclass. Set `.text`, `.fontSize`, `.align` and call `.update()`. |
| `SlugMaterial` | `MeshBasicNodeMaterial` with Slug vertex + fragment TSL shaders. |
| `SlugGeometry` | Instanced quad geometry with 5x vec4 per-glyph instance attributes. |

For full API docs with all options and types, see [docs/REFERENCE.md](docs/REFERENCE.md).

## Supported Font Formats

| Format | Support | Notes |
|--------|---------|-------|
| TTF (TrueType) | Full | Native quadratic Bezier outlines |
| OTF (OpenType/CFF) | Full | Cubic curves auto-converted to quadratics |
| WOFF | Full | Decompressed by opentype.js |
| WOFF2 | Not yet | Requires opentype.js 2.x (planned) |

## Compatibility

| Renderer | Status |
|----------|--------|
| `WebGPURenderer` (WebGPU) | Supported |
| `WebGPURenderer` (WebGL2 fallback) | Supported |
| `WebGLRenderer` (legacy) | Not supported -- use `WebGPURenderer` |

TSL compiles to WGSL for WebGPU and GLSL ES 3.0 for WebGL2. All features used (bitwise ops, `textureLoad`, `fwidth`, `Loop`) are available in both backends.

## Roadmap

- [ ] Dynamic vertex dilation for edge-pixel coverage
- [ ] Adaptive MSAA for small text (ppem < 16)
- [ ] Stem darkening for thin strokes
- [ ] Pixel-grid snapping for crisp small text
- [ ] React Three Fiber `<slugText>` component
- [ ] General shape rendering (SVG paths, icons)
- [ ] WOFF2 support via opentype.js 2.x

## Deep Dive

- [Architecture](docs/ARCHITECTURE.md) -- algorithm walkthrough, data flow, GPU data layout
- [API Reference](docs/REFERENCE.md) -- full API docs with all options and types

## Prior Art & References

This implementation is based on Eric Lengyel's Slug algorithm, which was [dedicated to the public domain](https://terathon.com/blog/decade-slug.html) in March 2026.

- [GPU-Centered Font Rendering Directly from Glyph Outlines](https://jcgt.org/published/0006/02/02/) -- Lengyel, JCGT 2017
- [EricLengyel/Slug](https://github.com/EricLengyel/Slug) -- MIT-licensed HLSL reference shaders
- [diffusionstudio/slug-webgpu](https://github.com/diffusionstudio/slug-webgpu) -- WGSL port
- [HarfBuzz 14.0 GPU module](https://github.com/harfbuzz/harfbuzz) -- production multi-platform implementation

See [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) for full attribution.

## License

[MIT](LICENSE)

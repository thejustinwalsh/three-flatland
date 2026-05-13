# @three-flatland/slug

GPU-accelerated, resolution-independent text rendering for [Three.js](https://threejs.org/) using the [Slug algorithm](https://sluglibrary.com/).

Slug evaluates quadratic Bezier curves directly in the fragment shader. No SDF atlas, no bitmap textures, no resolution ceiling. Text stays sharp at any size, any zoom, any perspective.

> **Alpha pre-release.** Public APIs may shift before `1.0`. Active feature work tracked in [#37 — Vector Graphics](https://github.com/thejustinwalsh/three-flatland/issues/37) and [#38 — Rich Text](https://github.com/thejustinwalsh/three-flatland/issues/38). Feedback welcome.

## Highlights

- **Pixel-perfect at every scale** -- glyphs are mathematically evaluated per-pixel, not sampled from a texture
- **WebGPU + WebGL2** -- TSL (Three Shader Language) targeting WGSL and GLSL ES 3.0
- **Instanced rendering** -- thousands of glyphs in a single draw call
- **Zero precomputation** -- load a TTF/OTF font, render immediately
- **Offline baking** -- `slug-bake` pre-processes fonts, eliminating opentype.js at runtime
- **Measurement, decorations, multi-font fallback, runtime-uniform outlines** -- ship-ready text features built on the same shader path

## Quick Start

```bash
pnpm add @three-flatland/slug three
```

```ts
import { SlugFontLoader, SlugText } from '@three-flatland/slug'

// Load a font (tries baked data first, falls back to .ttf)
const font = await SlugFontLoader.load('/fonts/Inter-Regular.ttf')

// Create text
const text = new SlugText({
  font,
  text: 'Hello, Slug!',
  fontSize: 48,
  color: 0xffffff,
  align: 'center',
})
scene.add(text)

// Call once per frame (rebuilds only when dirty)
text.update(camera)
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

| Export               | Description                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `SlugFontLoader`     | Loads `.slug.json` + `.slug.bin` (baked) or `.ttf`/`.otf`/`.woff` (runtime). Single entry point for fonts.                         |
| `SlugFont`           | Font data container. Glyphs, GPU textures, text shaping, `measureText`, `measureParagraph`, `wrapText`.                            |
| `SlugText`           | High-level `InstancedMesh` subclass. `.text`, `.fontSize`, `.align`, `.styles`, `.outline`.                                        |
| `SlugFontStack`      | Ordered fallback chain across multiple `SlugFont`s. Per-codepoint resolution.                                                      |
| `SlugStackText`      | Multi-font renderable (`Group`). One `InstancedMesh` per backing font. Full `SlugText` parity (`styles`, `outline`, `setOpacity`). |
| `SlugMaterial`       | `MeshBasicNodeMaterial` with Slug vertex + fragment TSL shaders.                                                                   |
| `SlugStrokeMaterial` | Stroke shader for outlined text — analytic distance-to-curve, runtime-uniform half-width.                                          |
| `SlugGeometry`       | Instanced quad geometry with 5× vec4 per-glyph instance attributes.                                                                |

For full API docs with all options and types, see [docs/REFERENCE.md](docs/REFERENCE.md).

## Pre-baking Fonts

`slug-bake` pre-processes font files offline, producing `.slug.json` + `.slug.bin` files that eliminate runtime font parsing and the opentype.js dependency:

```bash
npx slug-bake Inter-Regular.ttf                    # All glyphs
npx slug-bake Inter-Regular.ttf --range ascii       # ASCII only
npx slug-bake Inter-Regular.ttf --range latin       # Latin Extended
npx slug-bake Inter-Regular.ttf -r latin -r 0x2000-0x206F  # Multiple ranges
```

Place the baked files alongside the font. `SlugFontLoader.load()` detects them automatically — no code changes needed. The original `.ttf` is not fetched when baked data is present, and opentype.js never enters the bundle.

### Predefined ranges

| Name     | Unicode Range   | Description                              |
| -------- | --------------- | ---------------------------------------- |
| `ascii`  | U+0020–U+007E   | Printable ASCII (95 glyphs)              |
| `latin`  | U+0000–U+024F   | Basic Latin + Extended A/B (~525 glyphs) |
| `latin+` | Multiple blocks | Latin + punctuation + currency + symbols |

### Size comparison (Inter Regular)

| Range   | Glyphs | Raw      | Gzip   | Brotli |
| ------- | ------ | -------- | ------ | ------ |
| All     | 2,849  | 12.78 MB | 1.0 MB | 724 KB |
| `latin` | 523    | 2.15 MB  | 208 KB | 208 KB |
| `ascii` | 95     | 412 KB   | 44 KB  | 32 KB  |

Gzip/Brotli compression is handled by your CDN — no JS decompression needed. ASCII-only with Brotli is **32 KB** for resolution-independent text.

Missing glyphs at runtime render as a fallback rectangle (notdef).

## Supported Font Formats

| Format             | Support | Notes                                     |
| ------------------ | ------- | ----------------------------------------- |
| TTF (TrueType)     | Full    | Native quadratic Bezier outlines          |
| OTF (OpenType/CFF) | Full    | Cubic curves auto-converted to quadratics |
| WOFF               | Full    | Decompressed by opentype.js               |
| WOFF2              | Not yet | Requires opentype.js 2.x (planned)        |

## Compatibility

| Renderer                           | Status                                |
| ---------------------------------- | ------------------------------------- |
| `WebGPURenderer` (WebGPU)          | Supported                             |
| `WebGPURenderer` (WebGL2 fallback) | Supported                             |
| `WebGLRenderer` (legacy)           | Not supported -- use `WebGPURenderer` |

TSL compiles to WGSL for WebGPU and GLSL ES 3.0 for WebGL2. All features used (bitwise ops, `textureLoad`, `fwidth`, `Loop`) are available in both backends.

## Roadmap

**Shipped in alpha:**

- [x] Dynamic vertex dilation for edge-pixel coverage
- [x] React Three Fiber `<slugText>` / `<slugStackText>` components
- [x] Offline font baking with glyph subsetting
- [x] Stem darkening for thin strokes
- [x] Pixel-grid snapping for crisp small text
- [x] Font measurement (`measureText`, `measureParagraph`, `wrapText`)
- [x] Text decorations (underline, strikethrough, super/sub via `StyleSpan`)
- [x] Multi-font glyph fallback (`SlugFontStack`, `SlugStackText`)
- [x] Analytic stroked text (`SlugText.outline` — runtime-uniform width, bevel-via-min joins)
- [x] Stroke-set bake CLI (`slug-bake --stroke-widths`, `--stroke-join`, `--stroke-cap`)

**In progress:**

- [ ] [#37](https://github.com/thejustinwalsh/three-flatland/issues/37) — General shape rendering (`SlugShapeBatch`, SVG paths)
- [ ] [#37](https://github.com/thejustinwalsh/three-flatland/issues/37) — Baked-as-fill stroked text (1× fill cost) + dash arrays
- [ ] [#38](https://github.com/thejustinwalsh/three-flatland/issues/38) — Rich text (`SlugRichText`)

**Planned:**

- [ ] Adaptive MSAA for small text (ppem < 16)
- [ ] WOFF2 support via opentype.js 2.x
- [ ] Color emoji (COLR/CPAL/CBDT)
- [ ] Variable-width strokes along a path

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

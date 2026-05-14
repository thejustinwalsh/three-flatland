---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

### Initial release — GPU text rendering via the Slug algorithm

**Core rendering**
- `SlugText` (InstancedMesh subclass), `SlugMaterial`, `SlugGeometry` — resolution-independent text evaluated per-pixel in the fragment shader via TSL (WebGPU + WebGL2)
- RGBA16F curve textures + RG32F band textures with endpoint sharing
- `SlugFont` + `SlugFontLoader` supporting both offline-baked and runtime opentype paths

**Text shaping & measurement**
- `SlugFont.measureText` / `measureParagraph` / `wrapText` mirroring `CanvasRenderingContext2D.measureText` semantics
- `StyleSpan`-driven underline, strikethrough, superscript, and subscript rendered via rect-sentinel short-circuit in the fragment shader (no extra draw calls)

**Multi-font support**
- `SlugFontStack` for per-codepoint font resolution
- `SlugStackText` renders one `InstancedMesh` per backing font inside a single `Group`

**Stroke / outline**
- `SlugStrokeMaterial` with analytic distance-to-quadratic-Bezier shader
- `SlugText.outline` — runtime-uniform stroke width + color, no geometry rebuild
- Crispness-gated smoothstep keeps sub-pixel strokes visible; bevel-via-min joins at exterior corners

**Offline baking (CLI)**
- `slug-bake` CLI for subsetting fonts into compact binary assets
- Flags: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` for cartesian-product stroke baking
- `SlugFont.getStrokeGlyph(...)` for runtime lookup of pre-baked stroke glyphs
- Quadratic-Bezier adaptive stroke offsetter with miter/round/bevel joins, flat/square/round/triangle caps, miterLimit fallback, and inner+outer stitch

**Examples**
- `examples/three/slug-text/` and `examples/react/slug-text/` — Lorem and Icons modes (Inter + FontAwesome via `SlugFontStack`), Tweakpane controls, Canvas2D onion/split/diff compare overlay

**Documentation**
- `packages/slug/README.md`, `docs/ARCHITECTURE.md`, `docs/REFERENCE.md`
- Docs pages: `guides/slug-text` and `examples/slug-text`

Initial release of `@three-flatland/slug` — GPU-accelerated, resolution-independent text rendering for Three.js and R3F using the Slug algorithm (Eric Lengyel, JCGT 2017), with full shaping, measurement, stroke, multi-font fallback, and an offline baking CLI.

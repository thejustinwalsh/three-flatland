---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

### Initial release of `@three-flatland/slug`

**Core rendering**
- `SlugText` (InstancedMesh subclass), `SlugMaterial`, `SlugGeometry` — GPU-accelerated, resolution-independent text via the Slug algorithm (Eric Lengyel, JCGT 2017); quadratic-Bezier outlines evaluated per-pixel in a TSL fragment shader
- RGBA16F curve textures + RG32F band textures with endpoint sharing
- Targets WebGPU and WebGL2 through three-flatland renderer abstractions

**Font loading**
- `SlugFont` + `SlugFontLoader` supporting both baked (offline-precomputed) and runtime opentype paths
- `slug-bake` CLI for offline font baking with subsetting and Unicode-range selection
- Single `_backend: ShapingBackend` field replaces six function-pointer imports; loader binds the correct closures automatically

**Text layout**
- `SlugFont.measureText` / `measureParagraph` / `wrapText` matching `CanvasRenderingContext2D.measureText` semantics
- `StyleSpan`-driven underline, strikethrough, superscript, and subscript rendered through the existing instance pipeline (rect-sentinel short-circuit in the fragment shader — no extra draw call)

**Multi-font**
- `SlugFontStack` for per-codepoint font resolution
- `SlugStackText` renders a multi-font Group with one InstancedMesh per backing font

**Stroke / outline**
- `SlugStrokeMaterial` with analytic distance-to-quadratic-Bezier shader
- `SlugText.outline` — runtime-uniform width and color with no geometry rebuild
- Crispness-gated smoothstep keeps sub-pixel strokes visible
- Bevel-via-min joins at exterior corners

**Stroke offsetter**
- Quadratic-Bezier adaptive offsetter: per-segment offset, miter/round/bevel joins with `miterLimit` fallback, flat/square/round/triangle caps, inner+outer stitch
- `slug-bake` CLI flags: `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit` (cartesian-product baking)
- `SlugFont.getStrokeGlyph()` runtime lookup

**Examples**
- Paired Three.js (`examples/three/slug-text/`) and React (`examples/react/slug-text/`) demos with Tweakpane controls for size, darken, thicken, max-width, text styles, and outline (Fill/Outline/Both modes, width slider, color picker)
- Canvas2D compare overlay with onion/split/diff modes; Lorem and Icons demo modes via `SlugFontStack` (Inter + FontAwesome fallback)

**Docs**
- `packages/slug/README.md`, `docs/ARCHITECTURE.md`, `docs/REFERENCE.md`
- Starlight guide and example pages (`guides/slug-text.mdx`, `examples/slug-text.mdx`)

Initial release of `@three-flatland/slug` — GPU-accelerated resolution-independent text rendering for Three.js and R3F using TSL node materials, with full layout, decoration, stroke-offsetting, and multi-font fallback support.

# @three-flatland/slug

> GPU-accelerated, resolution-independent text and vector rendering. Quadratic Bézier curves are evaluated analytically in the fragment shader — no SDF, no atlas, no resolution ceiling.

Implements the Slug algorithm (Eric Lengyel, JCGT 2017). TSL only — compiles to WGSL and GLSL ES 3.0, so WebGPU and WebGL2 ship from one shader graph.

## Licensing — do not break this

`THIRD_PARTY_LICENSES` is load-bearing and must ship with the package. The algorithm is Eric Lengyel's; US Patent #10,373,352 was dedicated to the public domain via terminal disclaimer (2026-03-17), and the reference HLSL shaders are MIT. Our code is MIT. Keep the attribution intact in any fork, vendoring, or extraction.

## Architecture

Three shaping backends sit behind one dispatcher, bound at load time by `SlugFontLoader` and stored as `SlugFont._backend`:

| Backend | Source                                    | Path                          |
| ------- | ----------------------------------------- | ----------------------------- |
| runtime | opentype.js, parses TTF/OTF live          | `pipeline/textShaper.ts`      |
| baked   | `.slug.glb` packed tables, no opentype.js | `pipeline/textShaperBaked.ts` |
| stack   | multi-font fallback chain                 | `pipeline/textShaperStack.ts` |

Rendering is one instanced unit quad per glyph (`SlugGeometry`), with **five `vec4` per-instance attributes**: `glyphPos`, `glyphTex`, `glyphJac`, `glyphBand`, `glyphColor`. The list is freely extensible — add an `InstancedBufferAttribute` in the constructor and in `_grow`.

Cubic Béziers (CFF/OTF, and SVG path data) are converted by `cubicToQuadratics` in `pipeline/fontParser.ts` — De Casteljau split at t=0.5. `bandBuilder` only ever sees `QuadCurve[]`. Reuse this; do not write a second converter.

Decoration rects (underline, strikethrough) ride the same instance buffer via a sentinel: `glyphJac.w = -1` tells the fragment shader to short-circuit coverage to 1.

## Known gaps — check before promising a feature

These are real and currently unimplemented. Several are tracked as [#37 Vector Graphics](https://github.com/thejustinwalsh/three-flatland/issues/37) and [#38 Rich Text](https://github.com/thejustinwalsh/three-flatland/issues/38).

- **GSUB is explicitly disabled** (`pipeline/textShaper.ts`) — no ligatures, no contextual substitution. GPOS is kerning-only: no mark-to-base, no cursive attachment.
- **No bidi, no complex scripts.** Text is walked by UTF-16 code unit, so astral codepoints and emoji surrogate pairs are mishandled.
- **No per-instance clipping.** `SlugMaterial extends MeshBasicNodeMaterial`, which supports only three.js _global_ `clippingPlanes` — per-material, not per-instance. Any consumer needing `overflow: hidden` or a scroll container must add an instanced clip attribute plus a coverage mask in both `SlugMaterial` and `SlugStrokeMaterial`.
- ~~No public kerning API.~~ **Resolved (S1).** `SlugFont.getKerning(glyphIdA, glyphIdB)` dispatches to both backends and returns em-normalized kerning. Fonts encode tightening pairs (e.g. `AV`) as **negative** values; consumers add, not subtract.
- **`glyphColor` is per-instance but not exposed.** The shader already multiplies it in; `setGlyphs` just writes one color to every instance. Per-run color is plumbing, not shader work.
- **Outline-less glyphs are still filtered out of `shapeText` output** — you cannot place a caret after a space from shaped results alone. Use `slug/layout`'s positioned entries instead; they include whitespace. Renderers must skip entries whose `metrics.hasOutline === false`.
- ~~`wrapLines` breaks on the ASCII space only.~~ **Superseded (S2).** `slug/layout` ships three real wrap modes (`word` / `break-all` / `nowrap`), whitespace collapsing (`normal` / `pre` / `pre-line`), and `tabSize`. The legacy `pipeline/wrapLines.ts` remains for `SlugText`'s current path until it is migrated (R6). Still no soft hyphen and no UAX-14.
- ~~`measureParagraph` returns `{text, width}` per line.~~ **Superseded (S2).** `buildPositionedGlyphLayout` returns per-character entries **including whitespace**, per-line `y` and `baselineY`. `slug/query` adds `getCharIndex`, `getCaretTransformation`, `getSelectionTransformations`. `measureParagraph` remains as the Canvas2D-shaped convenience.
- **No `lineGap`.** Line spacing is a caller-supplied multiplier (default 1.2), not the font's native leading.

## Baseline conversion — one place, on purpose

`src/layout/baseline.ts` is the ONLY place the MSDF folded-`yoffset` convention is mapped
onto Slug's baseline-relative metrics: `getEmBoxTopOffset`, `getLineBaselineOffset`,
`getGlyphTopOffset`. Everything that positions a glyph or a caret derives its `y` from
those three. Get this wrong by a constant and every unit test still passes while every
line of text shifts — so it is asserted against hand-computed Inter-Regular values in
`src/layout/baseline.test.ts`. Do not inline a second copy of this math.

## Gotchas

- **Baked and runtime are _approximately_, not strictly, equivalent.** They diverge on two points: baked falls back to notdef (glyph 0) for missing glyphs where runtime does not, and baked infers outline presence from bounds-area because `unpackBaked` discards the curve list. Widths, kerning, cmap, and bands round-trip within float32. `baked.equivalence.test.ts` guards this — keep it green.
- **Baked cmap coverage depends on what was subsetted** at bake time (`cli.ts` Unicode-range selection). Runtime has the whole font. A codepoint that renders under runtime may be notdef under baked.
- `SlugStackText` is a `Group` with one `InstancedMesh` child per font, because each font binds distinct curve/band textures. Decorations attach to the primary mesh only.
- `SlugFontStack` resolves fallback **per UTF-16 code unit**, not per shaping run — so surrogate pairs and combining sequences are not treated as clusters, and cross-font kerning is intentionally dropped at run boundaries.
- `SlugStrokeMaterial`'s outer ring is clipped by the glyph bounding box. Wide strokes will be cut off.

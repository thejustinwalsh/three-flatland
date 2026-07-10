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

## The text engine — `@three-flatland/slug/text`

`src/text/` is the run-based paragraph engine, exported ONLY at the `./text` subpath (the root barrel is the rendering surface; the engine is its own domain). Vocabulary is the Slug User Manual's, not CSS's:

- **Runs are the core model** (manual §4.6/§4.7): `layoutParagraph(content, style)` takes `string | SlugRun[]` — a bare string is one implicit run. Per-run: `typeface`, `fontSize`, `tracking` (em; Slug's word for letter-spacing), `color`, `underline`, `strike`, `scriptLevel` (§2.7 transform-based scripts, applied |n| ≤ 3 times, font OS/2 metrics preferred via `getScriptTransform`), `weightBoost` (§4.9, render hint). `SlugCharacter.runIndex` groups per-material batches — **per-run `color` is how `glyphColor` gets driven**.
- **`SlugTypeface`** is the structural metrics contract (`unitsPerEm`, `ascender`, `descender`, `getGlyphMetrics(codePoint)`, `getKerning`); `SlugFont` AND `SlugFontStack` both satisfy it.
- **Caret + hit-testing are first-class** (LocateSlug/TestSlug): `hitTest` returns `{charIndex, lineIndex, trailing}` with the manual's p241 trailing rule (midpoint = half the glyph's OWN advance; tracking/kerning spacing belongs to the trailing side); `locateCaret` places carets before trailing spacing; `selectRange` returns per-line `SlugSpan`s (geometry only — panels are the consumer's job). `trailing`/`lineIndex` are the forward-compat hooks for bidi dual carets and ligature sub-glyph carets.
- **Whitespace model**: `collapseSpaces` / `preserveNewlines` / `wrap: 'word' | 'anywhere' | 'none'` replaced the CSS `whiteSpace`/`wordBreak` enums. Collapsed chars keep zero-advance entries so **`charIndex` is always a SOURCE-text index** (`characters[i].charIndex === i`). Tabs are real tab STOPS (`tabWidth`, §2.12), not fixed expansions. `justify` is independent of `alignment` (§2.11, last line exempt). There is no `verticalAlign` — Slug returns block height; boxing is the consumer's job.
- **Truncation** (`truncate: { ellipsis }`): wrap `'none'` + `maxWidth` swaps a line's tail for an ellipsis; dropped source chars become zero-advance entries, ellipsis entries append after all source entries carrying the first dropped `charIndex`.

### D6 — coordinate convention (ORCHESTRATOR RULING)

Slug paragraph space has its **origin at the block's top-left, +x right, +y DOWN**, for every input and output of the `./text` API — hit-test points, caret positions, baselines, spans. No center-origin anywhere, no input/output asymmetry. The ONE paragraph→world conversion is `paragraphYToWorldY` in `src/layout/worldSpace.ts`; never inline the flip.

## Known gaps — check before promising a feature

These are real and currently unimplemented. Several are tracked as [#37 Vector Graphics](https://github.com/thejustinwalsh/three-flatland/issues/37) and [#38 Rich Text](https://github.com/thejustinwalsh/three-flatland/issues/38).

- **GSUB is explicitly disabled** (`pipeline/textShaper.ts`) — no ligatures, no contextual substitution. GPOS is kerning-only: no mark-to-base, no cursive attachment.
- **No bidi, no complex scripts.** Text is walked by UTF-16 code unit, so astral codepoints and emoji surrogate pairs are mishandled.
- **No per-instance clipping.** `SlugMaterial extends MeshBasicNodeMaterial`, which supports only three.js _global_ `clippingPlanes` — per-material, not per-instance. Any consumer needing `overflow: hidden` or a scroll container must add an instanced clip attribute plus a coverage mask in both `SlugMaterial` and `SlugStrokeMaterial`.
- ~~No public kerning API.~~ **Resolved (S1).** `SlugFont.getKerning(glyphIdA, glyphIdB)` dispatches to both backends and returns em-normalized kerning. Fonts encode tightening pairs (e.g. `AV`) as **negative** values; consumers add, not subtract.
- ~~`glyphColor` is per-instance but not exposed.~~ **Half-resolved (T1).** Runs now expose it at the model level: `SlugRun.color` + `SlugCharacter.runIndex` give renderers everything needed to write per-run colors into the instance buffer. The `setGlyphs` plumbing that actually writes per-run colors is the run-conversion unit's job (`SlugText`/`SlugStackText` still write one color to every instance).
- **Outline-less glyphs are still filtered out of `shapeText` output** — you cannot place a caret after a space from shaped results alone. Use `slug/text`'s `layoutParagraph`; its `characters` include whitespace. Renderers must skip entries whose `hasOutline === false`.
- ~~`wrapLines` breaks on the ASCII space only.~~ **Superseded (S2, reshaped T1).** `slug/text` ships three wrap modes (`word` / `anywhere` / `none`), `collapseSpaces`/`preserveNewlines` whitespace handling, tab stops (`tabWidth`), full justification, and truncation. The legacy `pipeline/wrapLines.ts` remains for `SlugText`'s current path until it is migrated (R6). Still no soft hyphen and no UAX-14.
- ~~`measureParagraph` returns `{text, width}` per line.~~ **Superseded (S2, reshaped T1).** `slug/text`'s `layoutParagraph` returns per-character entries **including whitespace**, per-line `baselineY`/`ascent`/`descent`, plus `hitTest` / `locateCaret` / `selectRange`. The Canvas2D-shaped `measureParagraph` convenience on `SlugFont` remains.
- **No `lineGap`.** Line spacing is `lineSpacing` × fontSize (default 1.2), not the font's native leading.

## Baseline conversion — one place, on purpose

`src/layout/baseline.ts` is the ONLY place the MSDF folded-`yoffset` convention is mapped
onto Slug's baseline-relative metrics: `getEmBoxTopOffset`, `getLineBaselineOffset`,
`getGlyphTopOffset`. Everything that positions a glyph or a caret derives its `y` from
those three. Get this wrong by a constant and every unit test still passes while every
line of text shifts — so it is asserted against hand-computed Inter-Regular values in
`src/layout/baseline.test.ts`. Do not inline a second copy of this math. Its sibling
`src/layout/worldSpace.ts` is the equally-singular D6 paragraph-space → world-space y flip.

## Gotchas

- **Baked and runtime are _approximately_, not strictly, equivalent.** They diverge on two points: baked falls back to notdef (glyph 0) for missing glyphs where runtime does not, and baked infers outline presence from bounds-area because `unpackBaked` discards the curve list. Widths, kerning, cmap, and bands round-trip within float32. `baked.equivalence.test.ts` guards this — keep it green.
- **Baked cmap coverage depends on what was subsetted** at bake time (`cli.ts` Unicode-range selection). Runtime has the whole font. A codepoint that renders under runtime may be notdef under baked.
- `SlugStackText` is a `Group` with one `InstancedMesh` child per font, because each font binds distinct curve/band textures. Decorations attach to the primary mesh only.
- `SlugFontStack` resolves fallback **per UTF-16 code unit**, not per shaping run — so surrogate pairs and combining sequences are not treated as clusters, and cross-font kerning is intentionally dropped at run boundaries.
- `SlugStrokeMaterial`'s outer ring is clipped by the glyph bounding box. Wide strokes will be cut off.

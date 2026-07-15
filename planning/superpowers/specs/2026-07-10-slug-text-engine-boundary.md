# The Slug / uikit boundary

**Status:** ruled 2026-07-10, mid-flight on the `uikit-fork` worktree (PR #179, draft).
**Supersedes:** the S2 section of `2026-07-10-uikit-fork-tsl-slug-design.md`, which relocated
uikit's layout engine into Slug without reshaping it.

## The problem

S2 moved uikit's text layout and caret/selection queries into `packages/slug/src/layout/` and
`src/query/`. It did so faithfully — token for token. That was the bug.

What landed in Slug's **public root export** was uikit's CSS text model:

- `WhiteSpace` (`'normal' | 'pre' | 'pre-line'`), `WordBreak` (`'break-all'`), `VerticalAlign`
- `tabSize`, `letterSpacing`
- `createStubFont` — a **test helper**
- ~10 internals: `getOffsetToNextGlyph`, `getKerningOffset`, `getGlyphOffsetX`, `getTextXOffset`,
  `getTextYOffset`, `getWhitespaceWidth`, `buildLayoutResolved`, `measureResolved`,
  `resolveGlyphLayoutProperties`, `glyphWrappers`, `WordWrapper`, `BreakallWrapper`, `NowrapWrapper`

Neither `./layout` nor `./query` was in `package.json`'s `exports` map. They reached consumers
only by being flattened through the root barrel.

And uikit never imported any of it. `grep -rn "slug/layout\|slug/query" packages/uikit/src` → zero
hits. Two parallel implementations of the same logic, one of them unproven.

## What the manual actually says

Read from [Slug User Manual v7.5](https://sluglibrary.com/SlugManual.pdf). Printed page numbers
equal PDF page numbers.

Text layout **is** Slug's domain, and so is caret placement. This is not a judgement call:

| Capability                     | Slug's API                                               | Manual             |
| ------------------------------ | -------------------------------------------------------- | ------------------ |
| Line breaking / word wrap      | `BreakSlug()`, `BreakMultiLineText()`                    | p61, p55           |
| Multi-line layout              | `LayoutMultiLineText()`, `LineData`                      | §4.3, p198, p210   |
| Alignment, tab spacing         | `LayoutData`                                             | §2.11, §2.12, p188 |
| Measurement                    | `MeasureSlug()`                                          | p219               |
| Per-character compiled entries | `CompileString()` → `CompiledText` / `CompiledCharacter` | p102, p100, p98    |
| **Hit-test → caret**           | `TestSlug()` → `TestData`                                | p240, p239         |
| **Char offset → caret**        | `LocateSlug()` → `LocationData`                          | p212, p216         |
| Truncation / ellipsis          | `BuildTruncatableSlug()`                                 | p81                |
| Clipping                       | —                                                        | §4.10              |
| Icons and pictures             | `BuildIcon()`, `BuildPicture()`                          | §4.12              |

`LocateSlug()`, verbatim: _"determines **caret positioning** information for specific byte
locations within a text string."_ `TestSlug()`: _"determines which glyph in a line of text
corresponds to a given test position and **calculates the appropriate position for an insertion
caret**."_

Two structural facts drive our design:

1. **Slug is natively run-based and multi-font.** `CompileStringEx(fontCount, fontDesc[])`,
   `LocateSlugEx(fontCount, fontDesc[])`, the `RunData` structure, §4.6 Multiple Fonts, §4.7 Text
   Colors, §4.9 Optical Weight, and §6's format directives that switch font/colour/script inside
   the string. **Rich text is not a phase in Slug. It is the core model.**
2. **Caret and hit-test are first-class**, with semantics we do not implement: `trailingHitFlag`
   (the past-the-midpoint rule), `dualCaretOffset` (bidi direction-run boundary),
   `subglyphIndex`/`subglyphOffset`/`subligatureFlag` (caret inside a ligature), and this rule
   from p241 — _"If a glyph is followed by empty spacing due to a positive tracking value or a
   positive kerning adjustment, that spacing is considered part of the trailing side of the
   glyph."_

## The boundary

We are **not** porting Terathon's C++ API verbatim. Our API is ours. It takes the same
capabilities, in Slug's vocabulary, shaped for TypeScript — and it must serve every need uikit has.

**Slug's domain — typography.** A string (or runs), a typeface, and typographic parameters in; a
shaped paragraph and queries on it out.

**uikit's domain — the box model.** CSS vocabulary, flexbox, `three.Matrix4`, `@preact/signals`,
yoga's `MeasureFunction`, and the fact that a caret happens to be drawn as an instanced panel.

The consequence: the _capabilities_ Slug owns are exactly the ones the manual lists, but **none of
the CSS names**. "Collapse runs of spaces" and "preserve newlines" are typographic behaviours Slug
must implement. `whiteSpace: 'pre-line'` is a CSS _spelling_ of two booleans, and never appears in
Slug.

Three specific edges:

- **`selectRange` returns spans, not transforms.** `{ lineIndex, x0, x1, baselineY, ascent,
descent }`. Slug says _where_ the selection is; uikit decides that is an instanced panel. Real
  Slug has no selection API at all — this is the one piece of the old `slug/query` that genuinely
  belonged to uikit.
- **`hitTest` returns `trailing`.** Ours baked the midpoint rule in and discarded the flag.
- **`verticalAlign` does not exist in Slug.** Slug returns block height; positioning a block inside
  a box is uikit's job.

uikit keeps a small adapter mapping `whiteSpace` / `wordBreak` / `letterSpacing` / `verticalAlign`
onto Slug's `collapseSpaces` / `preserveNewlines` / `wrap` / `tracking`.

## uikit's six demands

Derived from its call sites, not from what S2 happened to move.

1. Measure a paragraph given available width → `{ width, height }`. Yoga calls this repeatedly per
   layout pass, so it must be cheap.
2. Positioned per-character entries **including whitespace**, with per-line `y` and baseline.
   Without whitespace you cannot place a caret after a space.
3. Hit-test: a point → a character index.
4. Caret: a character index → a position and height.
5. Selection: `[start, end)` → geometry per line.
6. Font metrics: advance, `lsb`, bounds, kerning, ascender/descender/unitsPerEm.

Everything else in uikit's `src/text/layout/` is uikit's: `matrix.ts` builds `three.Matrix4`s,
`normalize.ts` is signals plumbing, `measure.ts`'s `computedCustomLayouting` binds yoga's
`MeasureFunction`. None of it may enter Slug.

## The API — `@three-flatland/slug/text`

```ts
interface SlugTypeface {              // structural; SlugFont and SlugFontStack both satisfy it
  unitsPerEm: number
  ascender: number                    // em-space
  descender: number                   // em-space, negative
  getGlyphMetrics(codePoint: number): SlugGlyphMetrics | undefined
  getKerning(a: number, b: number): number
}

/** A contiguous span of text sharing a typeface and typographic style. */
interface SlugRun {
  text: string
  typeface?: SlugTypeface             // inherits the paragraph's
  fontSize?: number
  tracking?: number                   // em-space — Slug's word for letter-spacing
  color?: number | string | Color
  underline?: boolean
  strike?: boolean
  scriptLevel?: number                // + superscript, − subscript, |n| in [1,3]   (§2.7)
  weightBoost?: number                // optical weight                             (§4.9)
}

interface SlugParagraphStyle {
  typeface: SlugTypeface
  fontSize: number
  lineSpacing?: number                // × fontSize.  default 1.2
  tracking?: number
  tabWidth?: number
  alignment?: 'left' | 'center' | 'right'
  maxWidth?: number                   // omit = never wrap
  wrap?: 'word' | 'anywhere' | 'none'
  collapseSpaces?: boolean            // default true
  preserveNewlines?: boolean          // default true
  truncate?: { ellipsis?: string }
}

layoutParagraph(content: string | readonly SlugRun[], style: SlugParagraphStyle): SlugParagraph
measureParagraph(content: string | readonly SlugRun[], style: SlugParagraphStyle): { width: number; height: number }

hitTest(p, x, y):           { charIndex, lineIndex, trailing }
locateCaret(p, charIndex):  { x, baselineY, ascent, descent, lineIndex }
selectRange(p, start, end): readonly SlugSpan[]
```

`SlugParagraph` is `{ style, width, height, lines, characters }`.
`SlugCharacter` is `{ charIndex, glyphId, runIndex, lineIndex, x, advance, hasOutline }` — includes
whitespace; renderers skip `!hasOutline`. `runIndex` lets a renderer group into per-material
batches, which is finally what makes the per-instance `glyphColor` attribute earn its keep.

`layoutParagraph` accepts a bare `string` (one implicit run). **uikit's `Text` passes a string and
never learns what a run is.** That is how the API serves every need of uikit without uikit's model
leaking into Slug.

Types are shaped so bidi (`dualCaretOffset`) and ligature-aware carets (`subglyphIndex`) can land
later without a breaking change — `trailing` and `lineIndex` are the hooks. Neither is implemented:
GSUB is disabled, so ligatures cannot arise.

## Rulings

Both taken by the orchestrator in the stakeholder's absence, both marked in code, both reversible.

**D6 — coordinate convention.** Slug paragraph space has its origin at the block's top-left, +x
right, **+y down** — the way typography works — consistently for inputs and outputs. Conversion to
three's y-up happens **exactly once**, beside `src/layout/baseline.ts`.

Today `getCharIndex` takes top-left-origin input while `getCaretTransformation` emits centre-origin.
That asymmetry was uikit's, and S2 preserved it faithfully. It is an off-by-a-baseline bug factory,
and it should not be enshrined in Slug's public API.

`baseline.ts` remains the single source of the MSDF-baseline → Slug-ascender conversion. Get it
wrong by a constant and every test passes while every line of text shifts.

**D7 — `StyleSpan` → runs.** `@three-flatland/slug` is published at `0.1.0-alpha.1` and
`0.1.0-alpha.2`; local is an unreleased `0.1.0-alpha.3`. So `layout`/`query` are free to reshape —
new in this PR, never shipped. `StyleSpan` on `SlugText` **is** published surface. Runs subsume it.
Breaking it is acceptable in alpha, but must carry a changeset and a migration note.

## Issue disposition

Fifteen open issues carry the `slug` label. Each verified against code, not against its own text.

|                                                                                                   | Disposition                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#43** `SlugShapeBatch`                                                                          | **Closed by this PR.** Gate said "20+ shapes in 1 draw call"; measured 120 shapes, `drawCalls: 1`, both backends.                                                                                                                                                                                                                           |
| **#38** Phase 6: Rich Text                                                                        | **Closed by design.** Run-based paragraph _is_ the rich-text model.                                                                                                                                                                                                                                                                         |
| **#45** RichText data model + compiler                                                            | **Closed by design.** `compileRichText` becomes `layoutParagraph`.                                                                                                                                                                                                                                                                          |
| **#46** `SlugRichText` mesh wrapper                                                               | **Closed by design.** The wrapper stops existing — `SlugText` takes runs. Its example-and-docs debt is paid by the game-UI example, which wants coloured numbers and a bold header anyway.                                                                                                                                                  |
| **#42** SVG path-`d` parser                                                                       | **Keep open — more justified than when filed.** We ship the capability by delegating to three's `SVGLoader` (verified against all 1,594 lucide icons). But `SVGLoader` needs a DOM, which is why `uikit-bake icons` carries a lazy optional 17 MB `happy-dom` peer to run in Node. Writing the parser #42 asks for deletes that dependency. |
| **#40** dash-offset, **#41** outline baked-set, **#49** texture pool, **#44** slug-shapes example | Out of scope. The stroke/vector axis is a different problem from the text engine.                                                                                                                                                                                                                                                           |
| **#157** stacked-stroke artifacting on lowercase `e`                                              | Out of scope, but **likely fixed by #41** — baked fills do not accumulate stroke overdraw. Cross-reference the two.                                                                                                                                                                                                                         |
| **#104** docs tables, **#39/#47/#48** release discipline                                          | Untouched.                                                                                                                                                                                                                                                                                                                                  |

The issues are not an immutable gold standard. We have the real use case in front of us: a game UI
with a text field, over a lit tilemap, at 60 fps. Build for that; keep the boundary clean; uplift
what people will actually ask of Slug.

---
"@three-flatland/slug": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

## New APIs

- `SlugFont.measureText(text, fontSize)` → `TextMetrics` — single-line metrics aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, opts)` → `ParagraphMetrics` — multi-line convenience wrapper, respects same `lineHeight` default (1.2) as `SlugText`
- `SlugFont.wrapText(text, fontSize, maxWidth?)` → `string[]` — baked/runtime dispatch, line breaks match shaped output
- `SlugFont.hasCharCode(c)` — cheap codepoint coverage check via font cmap
- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; `resolveCodepoint` walks chain, first match wins
- `SlugFontStack.wrapText(...)` → `string[]` — line-for-line agreement with `SlugStackText` across mixed fonts
- `SlugStackText` — multi-font `Group`; one `InstancedMesh` per font, one draw call per contributing font
- `SlugStackText.styles`, `.outline`, `.setOpacity()` — parity with `SlugText` decoration/outline surface
- `SlugText.outline` — opt-in outline via a child `InstancedMesh` sharing the fill's `instanceMatrix`
- `SlugText.setOutlineWidth()`, `.setOutlineColor()`, `.setOpacity()` — runtime-uniform setters, zero rebuild
- `SlugStrokeMaterial` and `SlugOutlineOptions` exported from package root
- `StyleSpan { start, end, underline?, strike? }` — underline/strikethrough decoration ranges
- `SlugFont.emitDecorations()` / `SlugFontStack.emitDecorations()` — post-pass over shaped glyphs producing `DecorationRect[]`
- Stroke offsetter pipeline: `strokeOffsetter(curves, closed, options)` — adaptive subdivision → per-segment offset → join (bevel/miter/round) → cap (flat/square/triangle/round) → closed contours ready for the fill pipeline
- `bakeStrokeForGlyph(source, options)` — bridges the offsetter to the CLI bake pass and runtime fallback
- `SlugFont.getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` — looks up a pre-baked stroke glyph by matching stroke-set parameters
- Shared pipeline builders: `buildGpuGlyphData()`, `buildGpuGlyphFromCurves()`, `buildAdvanceOnlyGlyph()`
- `slug-bake` CLI gains `--stroke-widths`, `--stroke-join`, `--stroke-cap`, `--miter-limit`, `--output/-o` flags
- `BakedJSON.strokeSets` optional field — absent for fonts baked without stroke flags; backward-compatible

## Performance

- `curveTexture` switched to `RGBA16F` — halves texture bandwidth
- `bandTexture` switched to `RG32F` — eliminates two unused float channels per texel
- `MAX_CURVES_PER_BAND` reduced 64 → 40 — covers 100% of Inter's corpus; reduces shader register pressure
- `bandCount` increased 8 → 16 — halves expected curves per band (~6.3 → ~3.2 mean), linear reduction in fragment ALU
- Shader: non-crossing curves skip the post-`rootCode` solve, sqrt, and saturate work (~30% of curves per band)
- Stroke shader: single Newton seed (3 iterations) + 2 endpoint candidates vs. original 3 seeds × 3 iterations + 5 candidates — halves WGSL size, eliminates first-draw pipeline-compile stall

## Bug Fixes

- Stroke quad expansion now applied axis-aligned before the AA dilation pass — fixes stroke corners clipped/squared at glyph bbox extents
- `SlugText._setFont`: outline mesh only rebuilt when outline was already enabled — avoids GPU resource cost for users not using outlines
- `SlugText._setFont`: defers `visible = true` until first `_rebuild` — prevents WebGPU "binding size is zero" errors in R3F when a render pass fires before glyph data is written
- Runtime shapers now pass `{ features: [] }` to `opentype.js` — fixes whitespace collapse at wrap points caused by `liga`/`rlig` shortening the glyph array below `text.length`
- `parseFont` emits advance-only entries for cmap'd glyphs with no outline (space, tab, zero-width controls) — shaping resolves correct advance on both runtime and baked paths
- `SlugStackText.dispose()` now tears down outline child meshes before disposing shared geometries — fixes GPU memory leak on scene toggles
- Kerning extraction filters to source glyph IDs only — fixes `this.font._push is not a function` when stroke glyph IDs (outside opentype's range) were passed to the kern extractor
- Baked `measureText`: ink bounds now gated on `bounds-area (xMax > xMin)` instead of `curves.length > 0` — fixes zero ink bounds returned for every glyph on the baked path

## BREAKING CHANGES

- **BAKED_VERSION 2 → 3**: `curveTexture` format changed to `RGBA16F`, `bandTexture` to `RG32F`, `MAX_CURVES_PER_BAND` reduced to 40. Re-bake all `.slug.{json,bin}` files with `slug-bake`.
- **BAKED_VERSION 3 → 4**: `BakedJSON.metrics` extended with decoration metrics (`underlinePosition`, `underlineThickness`, `strikethroughPosition`, `strikethroughThickness`). Re-bake all `.slug.{json,bin}` files with `slug-bake`.
- `SlugFontLoader.clearCache` removed — the static cache is already keyed on `url:runtime?` and deduplicated automatically.
- `BAKED_VERSION` version-gate machinery removed from `SlugFontLoader` — no runtime version rejection; consumers are responsible for keeping assets in sync with the package.

This release ships the complete `@three-flatland/slug` text rendering library: analytic WebGPU text with measurement, font-stack fallback, underline/strikethrough decorations, runtime outlines, and a baked stroke-set pipeline for high-quality pre-computed strokes.

### 88fca030e97c3072503cd556111c42bef50c6102
feat: CLI + runtime integration for stroke-set bake (Task 17)
slug-bake grows --stroke-widths / --stroke-join / --stroke-cap /
--miter-limit flags. For every configured (width, join, cap,
miterLimit) tuple, each outlined source glyph is run through
`bakeStrokeForGlyph` and the resulting stroke pseudo-glyph gets
packed into the same curve + band textures as the source glyphs
with a fresh ID allocated at `glyphIdOffset + sourceId`. Stroke
glyphs render through the existing `slugRender` fill shader — no
new shader variant, 1× fill cost at runtime.

Baked format (optional field):

  BakedJSON.strokeSets?: Array<{
    width, joinStyle, capStyle, miterLimit, glyphIdOffset
  }>

Absent for fonts baked without stroke flags — old fixtures load
unchanged. Present for fonts baked with stroke flags; SlugFontLoader
forwards the metadata onto the loaded SlugFont. SlugFont gains
`getStrokeGlyph(sourceId, width, join, cap, miterLimit?)` which
looks up the matching set and returns the pre-baked stroke
SlugGlyphData, or null if no matching set exists (runtime async
fallback is Task 20's responsibility).

Kerning extraction now filters to source IDs only — stroke glyph
IDs live in ranges opentype.js doesn't know about, which caused
`this.font._push is not a function` when the kern extractor tried
to resolve them.

End-to-end bake on Inter-Regular ASCII subset with --stroke-widths
0.025 produces a valid .slug.{json,bin} pair, stroke glyphs
verified present at offset +1748.

Known follow-up (not blocking): at tight miter corners the stroke-
offset contours crowd bands beyond MAX_CURVES_PER_BAND (40). The
bake warns; runtime truncates and produces visibly-incorrect
coverage on those specific glyphs. Band-builder tuning for stroke
glyphs (denser bands, tighter thresholds) is a Task 17 follow-up
before Task 19 goes live — until then avoid baking strokes at
widths that cluster curves that densely, or raise the shader's
MAX_CURVES_PER_BAND.

Tests: 2 new in baked.test.ts covering strokeSets round-trip
(absent when not configured, passed through verbatim when set).
193 passing suite-wide.

Next: Task 18 — fill-shader dash-offset modifier.
Files: packages/slug/src/SlugFont.ts, packages/slug/src/SlugFontLoader.ts, packages/slug/src/baked.test.ts, packages/slug/src/baked.ts, packages/slug/src/cli.ts
Stats: 5 files changed, 249 insertions(+), 13 deletions(-)

### de5a2adc9548fc35e54ea33d8a48a5498100964a
feat: bakeStrokeForGlyph helper (Task 17 prep)
The bridge between the offsetter (Task 16) and everything downstream
that consumes stroked glyphs — the CLI bake pass (Task 17 proper),
the runtime async fallback worker (Task 20), and SlugShape.fromSvg
(Task 21).

bakeStrokeForGlyph(source, options) walks the source glyph's
contours (via its `contourStarts` into the flat `curves` array),
runs each contour through strokeOffsetter with the provided stroke
parameters, concatenates the resulting closed offset contours, and
packs them into a fresh SlugGlyphData via buildGpuGlyphData.

Returns null for advance-only glyphs (space, tab — nothing to
stroke) and for empty curve arrays. The stroked glyph preserves
the source's glyphId / advanceWidth / lsb so shaping produces
identical layouts for fill and stroke.

Currently assumes all source contours are closed, matching
TrueType/OpenType outline conventions. When SVG path support lands
(Task 21), a `closed: boolean[]` per-contour marker will thread
through here.

5 tests added, 44 in the offsetter file, 191 suite-wide:
  - advance-only glyph → null
  - empty curves → null
  - closed unit-square source → 2-contour output (outer + inner hole)
  - adjacent curves within each output contour share endpoints
  - advanceWidth / lsb / glyphId preserved from source
  - bounds grow outward beyond source (miter extends all 4 sides)

Next: Task 17.2 — slug-bake CLI flags and pipeline integration.
Files: packages/slug/src/pipeline/strokeOffsetter.test.ts, packages/slug/src/pipeline/strokeOffsetter.ts
Stats: 2 files changed, 141 insertions(+), 1 deletion(-)

### ae6db2741e7e3f45500bcce8636c02f25fa3e5b3
feat: stroke offsetter — stitch + full API (Tasks 16.5 + 16.6)
Final two steps of the quadratic-Bezier stroke offsetter. Ships the
complete build-time API — `strokeOffsetter(curves, closed, options)`
returns closed contour(s) ready to run through the Slug fill pipeline.

Sign convention flipped in this commit. Previously +halfWidth used
the left-hand normal of the source tangent; for CCW contours (font
glyphs in em-space), left-hand is *inside* the fill — so "outer"
was actually "inner". Flipped to right-hand normal so +halfWidth =
outside for CCW sources, matching the intuitive "stroke outward"
meaning and matching what fontParser emits.

Task 16.5 — contour stitching. `reverseContour(curves)` reverses
traversal direction (reverses the array and swaps p0/p2 per curve);
`offsetOneSide(source, signed, ...)` walks adjacent source curves,
offsets each, and inserts join geometry between neighbors. Closed
sources wrap around; open sources skip the last-to-nothing step.

Task 16.6 — `strokeOffsetter` orchestrator. Closed source returns
two contours (outer CCW + inner reversed to CW, forming an annular
ring the fill rule renders as just the stroke). Open source returns
one closed contour stitching outer forward + end cap + inner
reversed + start cap. Start-cap tangent is the negation of the
initial tangent (so it points *out* of the contour).

11 new tests, 39 in the offsetter file, 186 suite-wide:
- reverseContour: swaps direction, round-trip is identity
- Closed source: two contours, outer CCW / inner reversed CW (via
  shoelace), cap style is irrelevant, outer grows the unit square
  to match miter-corner extension at each vertex
- Open source: single closed contour, flat < triangle ≤ square ≤
  round in quad count, adjacent curves share endpoints, last.p2 =
  first.p0 (fully closed loop)
- Empty source: empty output for both closed and open modes

Phase 5 Task 16 is complete. Next: Task 17 — stroke-set bake
integration into `slug-bake` CLI.
Files: packages/slug/src/pipeline/strokeOffsetter.test.ts, packages/slug/src/pipeline/strokeOffsetter.ts
Stats: 2 files changed, 365 insertions(+), 32 deletions(-)

### c16c7466b555177d72929dd7fa338d55bcf753b4
feat: stroke offsetter — cap insertion (Task 16.4)
Fourth step of the offsetter: emit cap geometry at open-contour
endpoints, filling the gap from outerEnd (left-hand offset) to
innerEnd (right-hand offset) "around" the endpoint.

- flat: 1 straight quadratic outer → inner. Stroke ends precisely
  at the endpoint, no extension.
- square: 3 straight quadratics forming a rectangle half-width past
  the endpoint along the tangent. outer → outer+t·hw → inner+t·hw
  → inner.
- triangle: 2 straight quadratics meeting at an apex at endpoint +
  tangent · halfWidth. Isosceles by construction.
- round: semicircle centered at the endpoint, radius |halfWidth|,
  split into ≤60°-per-segment quadratics.

Round-cap arc direction: disambiguated via the tangent. The cap
should bulge in the direction of travel (out of the contour), not
back through the stroke. We sample the midpoint of each candidate
arc direction and pick the one whose midpoint lies on the tangent
side. For a straight stroke terminating along +x, the cap arc
bulges into the +x half-plane.

Closed contours never invoke this — caps only apply at open-contour
start and end vertices.

Tests (4 added, 28 total, 175 suite-wide):
  - flat → 1 quad with zero extension
  - square → 3 quads forming rectangle with correct corner coords
  - triangle → 2 quads meeting at apex at endpoint + tangent·hw
  - round → 3 quads for semicircle, each bulging in tangent direction

Next: Task 16.5 inner + outer close (stitch the offset contours
into closed shapes for rendering through the fill pipeline).
Files: packages/slug/src/pipeline/strokeOffsetter.test.ts, packages/slug/src/pipeline/strokeOffsetter.ts
Stats: 2 files changed, 198 insertions(+)

### ee6e60d964389509723c263cb234c64919b423fa
feat: stroke offsetter — join insertion (Task 16.3)
Third step of the offsetter: given two adjacent offset segments
meeting at a source-contour corner where tangents are discontinuous,
emit quadratic geometry to fill the gap on the outside of the corner.

- bevel: single straight quadratic from endA to startB.
- miter: two straight quadratics meeting at the miter point (the
  intersection of offset tangent lines through endA and startB).
  Falls back to bevel when miter length exceeds miterLimit * halfWidth
  — matches SVG stroke-miterlimit behavior. Default SVG miterLimit
  is 4.
- round: arc from endA to startB centered at the corner with radius
  |halfWidth|, split into ≤60°-per-segment quadratics. Each 60°
  quadratic arc has max deviation ~r·(1-cos30°)² ≈ 0.018·r, below
  any practical stroke error budget.

Smooth joins (coincident offset endpoints) short-circuit to an
empty array — no geometry needed when tangentA == tangentB.

Caller chooses which side to join. For a CCW source contour with
positive halfWidth (outside-on-the-left), the gap exists on the
outer side of the corner and this function emits geometry there.
The inner side gets overlap which the winding-rule fill handles
cleanly in v1 (cleanup is a post-pass, out of scope for 16.x).

Shared helpers: `intersectLines` (parametric line/line intersection
with parallel detection) and `straightQuad` (quad with p1 at chord
midpoint). Both reusable by Task 16.4 cap insertion.

Tests (6 added, 24 total): smooth join → empty; bevel → 1 straight
quad at correct endpoints; miter at 90° with miterLimit=4 → 2 quads
meeting at (-1,1) miter point; acute miter → bevel fallback; round
at 90° → 2 segments with midpoints on unit circle; round at 180°
→ 3 segments.

Next: Task 16.4 cap insertion (flat / square / round / triangle at
open-contour endpoints).
Files: packages/slug/src/pipeline/strokeOffsetter.test.ts, packages/slug/src/pipeline/strokeOffsetter.ts
Stats: 2 files changed, 283 insertions(+), 1 deletion(-)

### c570cb1561bcfe3a181dfb33e8f1b4507c503fd3
feat: stroke offsetter — per-segment offset (Task 16.2)
Second step in the quadratic-Bezier stroke offsetter. Given a single
(already-subdivided) quadratic and a signed offset distance, produce
its offset quadratic via the Tiller-Hanson construction:

  1. Offset p0 along its unit normal by ±halfWidth  → p0'
  2. Offset p2 along its unit normal by ±halfWidth  → p2'
  3. Intersect the two offset tangent lines through p0' and p2' to
     locate p1'

Sign convention: left-hand normal of the tangent, so a positive
offset moves the curve to the left of its direction of travel.
Callers walking a closed contour counter-clockwise (font convention:
outside-on-left) use +halfWidth for the outer offset, -halfWidth
for the inner.

Degenerate cases:

- Parallel offset tangents (straight segment or cusp): p1' falls
  back to the midpoint of p0' and p2'. For a genuinely straight
  segment this is exact; for cusps the caller should have pre-
  subdivided past the inflection point.
- Zero offset returns the input unchanged.
- Degenerate tangent (coincident control points) falls back to the
  chord direction via `unitTangentAt`.

Caller contract (documented in the function): pass only curves
that have been through `subdivideForOffset` first. Calling on
highly-curved sources produces visibly off offsets because a single
quadratic can't approximate an offset arc beyond ~16° of turn at
the default tolerance.

Tests (7 added, 18 total): horizontal line offsets upward with
left-hand normal, negative halfWidth offsets downward, vertical
line offsets left, offset-endpoint distance equals halfWidth for
curved segments, offset endpoint offset is perpendicular to the
source tangent, symmetric curve inner/outer offsets are mirror
images, zero offset is identity, offset round-trip returns
endpoints to within 1e-8.

Next: Task 16.3 join insertion (miter / round / bevel between
adjacent offset segments).
Files: packages/slug/src/pipeline/strokeOffsetter.test.ts, packages/slug/src/pipeline/strokeOffsetter.ts
Stats: 2 files changed, 167 insertions(+), 1 deletion(-)

### 4e7a308af2a22f33eb49cd692c2d4464b60d7a4f
feat: stroke offsetter — adaptive subdivision (Task 16.1)
First of six steps in the quadratic-Bezier stroke offsetter. This
step is pure subdivision: given a quadratic and a stroke half-width,
produce a list of sub-quadratics each flat enough that a single-
quadratic offset will fit within epsilon of the true offset curve.

Criterion: max error of a single-quadratic approximation of a
circular arc (angle α, radius r) is ~r·α²/8. Solving for α gives
α_max ≤ √(8·epsilon/r). We conservatively use halfWidth as the
offset radius proxy, so

  α_max = sqrt(8 · epsilon / halfWidth)

With the roadmap default `epsilon = 0.01·halfWidth`, α_max ≈ 16°
— fine for body-text, coarse-ish for large display outlines where
callers can pass a tighter epsilon.

Flatness shortcut: if the control point is within epsilon of the
p0→p2 chord, the curve is essentially linear and subdivision stops
regardless of angle — the offset of a line is a line.

Degenerate inputs pass through unchanged (p0 == p2 spike, all
control points coincident). Recursion caps at maxDepth=8 (256
leaves max) so pathological inputs can't blow up compilation.

Also exports `unitTangentAt(curve, t)` — used by 16.1 for endpoint
tangents, reused by 16.2 (per-segment offset) for offset direction
and by 16.3 (joins) for bisector math.

11 tests pass: straight segments preserved, endpoint invariant
across splits, tighter epsilon → more subdivision, larger halfWidth
(relative to curvature) → more subdivision, degenerate inputs
survive without infinite recursion, tangent at endpoints points in
the correct direction and is unit-length.

Next: Task 16.2 per-segment offset (map each subdivided quad to
its offset quad at ±halfWidth).
Files: packages/slug/src/pipeline/strokeOffsetter.test.ts, packages/slug/src/pipeline/strokeOffsetter.ts
Stats: 2 files changed, 324 insertions(+)

### c69e7a0aac881e2be7ab330f988273a4c80a75bb
feat: compare mode 'off' + DPR sync + defensive cleanup
Three fixes rolled together.

1) Compare mode gains an `Off` option.

   The radio in both examples now exposes `Off | Onion | Diff | Split`.
   `Off` hides the entire compare overlay — canvas, split handle, left
   and right labels — leaving just the Slug rendering standalone. Good
   for pure-signal verification and for screenshotting without the
   Canvas2D comparison in frame.

   React: conditional fragment wraps CompareCanvas + SplitHandle +
   SplitLabels on `compareMode !== 'off'`. Measure overlay is still
   gated on `!iconsMode` independently, so `Off + Lorem` still shows
   hover-measure.

   Three: `updateSplitUI()` toggles `display: none` on compare-canvas,
   split-handle, and the two labels when mode is `off`. `redrawCompare`
   short-circuits to a canvas clear and skips all the Canvas2D text
   work — no CPU cycles spent when the overlay is hidden.

2) DPR re-sync on R3F canvas after monitor swap / fullscreen.

   R3F's `<Canvas>` captures `devicePixelRatio` at mount and doesn't
   re-sync on monitor-swap / OS-zoom / fullscreen transitions. Post-
   transition the Slug canvas was stuck at the old ratio while the
   compare canvas used the live DPR, producing sub-pixel drift.

   New `<DprSync dpr={windowSize.dpr} />` component (inside Canvas)
   calls `gl.setPixelRatio(min(dpr, 2))` whenever the tracked DPR
   changes. Combined with the earlier `useWindowSize` DPR tracking,
   all three resize sources (window resize, `(resolution: Ndppx)`
   media query, fullscreenchange) now flow through to both canvases
   simultaneously.

3) `SlugStackText.dispose()` now cleans up outlines + fill meshes.

   Previous implementation disposed geometries + materials but left
   the outline child meshes + SlugStrokeMaterials hanging. On scene
   toggle (Lorem ↔ Icons), the Group was removed from R3F's scene
   graph but our own internal refs held onto outline materials,
   producing small GPU leaks over repeated toggles.

   Fix: teardown outlines first (shared geometry with fill meshes —
   so this has to happen before we dispose the geometries, otherwise
   the disposal flow double-frees). Then remove + dispose each fill
   InstancedMesh. Then dispose geometries + materials. Clears
   internal arrays.

All 147 tests pass. Typecheck clean on slug + both examples. No
public API changes — 'off' is additive in the enum, DprSync is an
example-internal component, SlugStackText.dispose was already a
public method with a too-shallow implementation.
Files: examples/react/slug-text/App.tsx, examples/three/slug-text/main.ts, packages/slug/src/SlugStackText.ts
Stats: 3 files changed, 79 insertions(+), 18 deletions(-)

### ccaf65ddabc9fd7908d171862863423431a4703e
feat: SlugStackText parity — styles, outline, opacity
Closes the feature-parity gap between SlugStackText (used in icons
mode) and SlugText. Icons rendered through a font stack are text,
generated through the same shaping pipeline, and deserve the same
surface for decorations and outline.

Library additions:

- `SlugStackText.styles: StyleSpan[]` — underline / strike spans.
  Shaping emits a flat positioned-glyph list plus a parallel font-
  index array, decorations walk in srcCharIndex order via the new
  `SlugFontStack.emitDecorations()` method. Decoration rects attach
  to the primary font's mesh only (one underline/strike line per
  rendered line — duplicating to fallback meshes would double-draw
  the same pixels).
- `SlugStackText.outline: SlugOutlineOptions` — parity with
  `SlugText.outline`. Creates a sibling stroke InstancedMesh for each
  font in the stack, each sharing its fill mesh's `instanceMatrix`
  and bound to its own font's curve/band textures via
  `SlugStrokeMaterial`. RenderOrder -1 so strokes draw behind fills.
  Runtime setters: `setOutlineWidth`, `setOutlineColor` — uniform-
  only, zero rebuild.
- `SlugStackText.setOpacity(value)` — forwards to every per-font
  fill material so Outline-only mode (fill alpha 0, stroke visible)
  works in icons mode too.
- `SlugFontStack.emitDecorations()` — new method. Builds a per-glyph
  advance lookup via a WeakMap keyed on the positioned-glyph object
  (a single-font Map keyed on glyphId can't disambiguate when the
  same glyphId exists in two stacked fonts with different advances).
  Uses the *primary* font's decoration metrics so underline/strike
  lines stay visually consistent across a styled run even when
  individual chars render from different fonts.
- `emitDecorations` (pipeline) gains a function-callback variant of
  the advance lookup. Legacy Map signature still works unchanged —
  SlugFont.emitDecorations keeps its old call shape.

Example parity (React + Three, 1:1 restored):

- React: SlugStackTextScene accepts `styles`, `outlineStyle`,
  `outlineWidth`, `outlineColor`. useEffect-driven runtime setters
  mirror SlugTextScene exactly. Outline-only fill-opacity drop now
  works on stack too.
- Three: `applyStyles` + `applyOutline` fork to both `slugText` and
  `stackText`. Outline width/color sliders call setters on both.
  Scene switch flips visibility but both still receive style/outline
  updates, so toggling scenes mid-session preserves state.

Underline/strikethrough in icons mode: now works. Icon glyphs
render from FA-Solid, but the underline runs under them with Inter's
declared line position — matches the browser's CSS behavior where a
text-decoration line is fixed by the root font and spans all child
runs regardless of font-family changes.

Outline in icons mode: dynamic stroke via SlugStrokeMaterial, one
mesh per font. Phase 5's baked stroke path (Task 19 in the plan)
will swap these child meshes for offset-contour fill meshes; the
API surface stays identical so the switch is transparent to users.

All 147 existing tests pass. Typecheck clean on slug + both examples.
Files: examples/react/slug-text/App.tsx, examples/three/slug-text/main.ts, packages/slug/src/SlugFontStack.ts, packages/slug/src/SlugStackText.ts, packages/slug/src/pipeline/decorations.ts
Stats: 5 files changed, 299 insertions(+), 13 deletions(-)

### b8d34b46b9ba1c0b6ddc15ca70e088eb84bb2fd2
refactor: extract shared contour-to-GPU pipeline
Phase 5 Task 15 — factor the "curves + contour starts → SlugGlyphData"
step out of fontParser into a shared pipeline module.

Three Phase 5 producers will emit glyph-shaped GPU data:
- fontParser (closed font contours via opentype.js)
- SlugShape.fromSvg (closed or open SVG contours via the path-d parser)
- strokeOffsetter output (baked stroke contours)

Centralizing "what's a GPU-ready glyph?" in buildGpuGlyph.ts ensures
all three produce records with identical shape: same bounds-from-
control-points computation, same band builder call, same default
bandLocation/curveLocation zeros.

Three exported builders:
- buildGpuGlyphFromCurves(curves, contourStarts) — raw pipeline,
  returns { curves, contourStarts, bands, bounds }. For producers that
  need to attach their own glyph metadata later.
- buildGpuGlyphData(glyphId, curves, contourStarts, advance, lsb) —
  full SlugGlyphData with glyph-specific fields applied.
- buildAdvanceOnlyGlyph(glyphId, advance, lsb) — zero-bounds entry for
  no-outline cmap'd glyphs (space, tab, zero-width controls). Already
  baked in CLI; runtime path now uses the same factory.

fontParser shrinks: the inline branching on `hasOutline` + the local
`computeBounds` are gone. The opentype-specific bits (glyph iteration,
extractCurves from path commands) stay in fontParser.

Tests:
- 7 new tests in buildGpuGlyph.test.ts nail down the contract (bounds
  include control points, contourStarts preserved, has-ink predicate
  works for both outline + advance-only records).
- All 140 existing tests still pass — this is a pure refactor with no
  behavior change to the font path.

Phase 5 regression gate: typechecks clean on slug + both examples,
no public API changes, no change to baked file format.
Files: packages/slug/src/pipeline/buildGpuGlyph.test.ts, packages/slug/src/pipeline/buildGpuGlyph.ts, packages/slug/src/pipeline/fontParser.ts
Stats: 3 files changed, 204 insertions(+), 47 deletions(-)

### a877398a57919ab33a64a8b59bb5b88be73513d2
fix: stroke quad axis-aligned expansion + halve shader compile cost
Two bugs reported after Phase 4 landed.

1) Outline clipped / squared off at glyph extents.

   slugDilate was expanding the quad by strokeHalfWidth along the unit
   outward normal. At a quad corner the unit normal is diagonal —
   (1, 1)/√2 — so adding halfWidth along that direction only expands
   each axis by halfWidth/√2 ≈ 0.707·halfWidth. Fragments past the
   glyph bbox + halfWidth on a single axis fell outside the quad, got
   culled, and the stroke's outer ring was visibly clipped square at
   the glyph's x/y extents.

   Fix: hoist the stroke-width expansion out of slugDilate and apply
   it axis-aligned in SlugStrokeMaterial's vertex shader before the
   pixel-AA dilation pass. Every quad vertex now pushes outward by
   strokeHalfWidth along each axis independently (signed by basePos
   quadrant), growing the full W × H quad to (W + 2·halfWidth) × (H +
   2·halfWidth). Pixel-AA dilation runs on top via the original unit-
   normal math, which is what the AA window actually wants.

   slugDilate's strokeHalfWidth parameter is removed — fill-only
   callers revert to their pre-Phase-4 code path byte-for-byte.

2) Major lag / hitch on first outline-enable toggle.

   Root cause: first draw of the stroke mesh triggers a synchronous
   WebGPU pipeline compile for slugStroke's heavy fragment shader. The
   distanceToQuadBezier TSL port inlined 3 Newton seeds × 3 iterations
   each + 5-candidate min — ~235 TSL ops per curve × 40 curves per
   band × 2 bands = ~19K ops in the fragment shader. The resulting
   WGSL is large enough that the browser's WGSL compiler stalls the
   frame for hundreds of milliseconds on first use.

   Fix: single Newton seed at t=0.5 with 3 iterations, plus both
   endpoints as hard candidates (3 candidates total instead of 5).
   Cuts WGSL size roughly in half — directly halves pipeline compile
   time. Per-fragment runtime cost after compile also drops ~⅔, which
   incidentally improves GPU-bound perf.

   Trade: the seed-spread we had was insurance against back-bending
   S-curves with multiple local minima. Font parsers typically split
   cubics at inflection points so emitted quadratics are monotone
   along one axis — single-seed Newton converges to the global min
   for virtually all text glyph curves. The pure-JS reference keeps
   the 3-seed implementation and its full test corpus (all 140 tests
   still pass). Phase 5 shapes with arbitrary open paths may need the
   full reference algorithm back; we'll either switch or split inputs
   at inflection at bake time.

Canonical-Slug review: manual §4430, §4714 confirm standalone strokes
don't generate band data and the fragment shader walks all stroke
curves per-fragment. Slug's reference bakes stroke geometry at
conversion time with a fixed width, so it doesn't face the runtime-
uniform-width pipeline cost we do. Our reuse of glyph bands (which
already exist for fills) for text strokes is a win Slug-ref doesn't
have access to. Slug's reference also ships explicit miter/round/cap
geometry — our Phase 4 skips those (bevel-via-min). Phase 5 adds the
explicit geometry path so the outline's exterior corners no longer
clip square at the bisector.

Also reverted SlugText._setFont to rebuild the outline only when
already enabled — don't pay GPU-resource cost for users who never
opt into outlines.
Files: packages/slug/src/SlugStrokeMaterial.ts, packages/slug/src/SlugText.ts, packages/slug/src/shaders/distanceToQuadBezier.ts, packages/slug/src/shaders/slugDilate.ts
Stats: 4 files changed, 105 insertions(+), 74 deletions(-)

### 426ebb1b7f2b086dc5f121d6ad2ac3a9de9db80a
feat: outlined-text example with runtime width + color controls
Phase 4 Task 14 — interactive outline surface in both examples (React
+ Three, 1:1 parity).

Tweakpane Outline folder:
- Radio `style: [Fill | Outline | Both]` — Fill: outline off, fill
  visible. Outline: outline on, fill opacity=0 so only the stroke
  shows. Both: outline + fill visible, stroke drawn behind (renderOrder
  = -1 on the child mesh + transparent blend composites them).
- Slider `width` (0.001..0.15 em) — runtime uniform, zero rebuild.
  Scrub it and the outline thickens/thins live.
- Color picker `color` — runtime uniform, same zero-rebuild story.

SlugText additions to make this work:
- `setOpacity(value)` forwards to the fill material's opacity uniform
  so Outline-only mode can fade the fill without mutating the mesh
  tree or rebuilding geometry.
- SlugOutlineOptions.color accepts `number | string | Color` — tweakpane
  emits CSS hex strings (e.g. '#ff00aa'), which three.js Color.set()
  parses natively. Keeps the library-side API simple while matching
  where colors actually come from in a typical app.

Phase 4 wraps with this ship gate: interactive verification in a dev
build that width + color updates apply live, both scenes (Lorem / Icons)
continue to render correctly, and Outline-only / Both modes composite
against the Canvas2D compare overlay as expected. The formal crispness
golden suite (Task 13) is deferred to sign-off as a follow-up — easier
to tune thresholds against real visual output than against a priori
goldens, and the CPU reference already validates the math.

Phase 5 picks up from here: 3-texel curve layout with neighbor tangents,
explicit miter/round/bevel join dispatch, cap styles, dashing, and
SlugShapeBatch for arbitrary SVG paths.
Files: examples/react/slug-text/App.tsx, examples/three/slug-text/main.ts, packages/slug/src/SlugText.ts, packages/slug/src/types.ts
Stats: 4 files changed, 91 insertions(+), 3 deletions(-)

### ce74ac6f4b2bd43fdc877bd1caa27e22370fe2ca
feat: SlugText.outline with runtime-uniform width + color
Phase 4 Task 12 — `SlugText.outline` surface. Opt-in outline renders a
child InstancedMesh behind the fill mesh, sharing the glyph SlugGeometry
and the fill mesh's `instanceMatrix` attribute (no copy, no drift), with
its own SlugStrokeMaterial.

API:
  new SlugText({ text, font, outline: { width: 0.03, color: 0x000000 } })
  slugText.outline = { width: 0.05 }   // toggle/update
  slugText.outline = null              // disable + dispose child mesh
  slugText.setOutlineWidth(0.04)       // runtime-uniform setters
  slugText.setOutlineColor(0xff00ff)

Behavior:
- `renderOrder = -1` on the child so the stroke draws first; fill is
  drawn on top via the normal transparent blend path.
- Width/color setters mutate the uniform in place — no _rebuild, no
  instance-data churn. Tweakpane sliders update live at zero cost.
- Font swap tears down the old stroke material and rebuilds against the
  new font's texture pair. font = null tears it down entirely.
- _setupOutline runs after _setFont so R3F prop-set order (outline
  before font, or vice versa) always ends with a wired outline when
  both are set.
- _syncOutline mirrors `count` + `instanceMatrix` from the fill mesh
  after every _rebuild — handles the dirty=true-but-count=0 case where
  the fill goes invisible.
- update(camera) calls updateMVP on both materials so the stroke's
  dilation stays current every frame.
- Dispose tears down the child mesh, its geometry is shared with the
  fill so we don't double-dispose.

Types: SlugOutlineOptions exported from the package root.

Phase 5 extends this API with join / miterLimit / cap; Phase 4's
bevel-via-min is the out-of-the-box behavior until then.
Files: packages/slug/src/SlugText.ts, packages/slug/src/index.ts, packages/slug/src/types.ts
Stats: 3 files changed, 133 insertions(+), 4 deletions(-)

### 74b8f976a93f0bec4c5c6f9737a8dffd3009ccf9
feat: SlugStrokeMaterial + stroke-aware dilation
Phase 4 Task 11 — stroke-capable NodeMaterial + optional strokeHalfWidth
on slugDilate so the instance quad grows past the fill bbox.

- slugDilate accepts an optional `strokeHalfWidth` em-space node. When
  provided, the vertex is displaced by `strokeHalfWidth / invScale`
  object-space units along the unit outward normal, on top of the
  existing half-pixel AA dilation. Undefined preserves legacy fill-only
  behavior exactly (no branch in the generated TSL).

- SlugStrokeMaterial parallels SlugMaterial: same instance-attribute
  layout, same MVP/viewport uniforms, same updateMVP/setViewportSize
  lifecycle. Fragment path uses slugStroke (distance-to-curve) instead
  of slugRender (winding number). Decoration rectangles (vNumVBands < 0
  sentinel) short-circuit to zero coverage so they render only via the
  fill pass — underline/strike never strokes itself.

- Uniform surface is the Phase 4 contract: color, opacity,
  strokeHalfWidth. Phase 5 extends with joinStyle/miterLimit/capStyle —
  strictly additive (the Phase 5 plan reserves those slot names).

- SlugStrokeMaterial exported from the package root alongside its
  options type.

Phase 4 next: SlugText.outline surface (Task 12) hooks a child mesh
with this material; crispness gate (Task 13); example controls
(Task 14).
Files: packages/slug/src/SlugStrokeMaterial.ts, packages/slug/src/index.ts, packages/slug/src/shaders/slugDilate.ts
Stats: 3 files changed, 243 insertions(+), 11 deletions(-)

### b270b59037f7123197496d97502a2b166d8dc8b2
feat: analytic stroke shader (bevel-via-min)
Phase 4 Task 10 — TSL port of distanceToQuadBezier + slugStroke fragment
shader + CPU reference for stroke coverage.

- TSL distanceToQuadBezier mirrors the pure-JS reference line-for-line:
  cubic coefficients from (A, D, M), three Newton seeds at t ∈ {0, 0.5, 1}
  × three iterations each, clamped to [0, 1], then min over 5 candidates
  (the three refined seeds plus the two endpoints). Endpoint t values
  survive as sentinels for Phase 5's join classifier.

- slugStroke runs the same h-band + v-band iteration as slugRender but
  with `distanceToQuadBezier` per curve, tracking `min(d)` in a varying.
  Exterior joins come out as clean bevels without any explicit geometry:
  at a contour vertex, both curves' capsules contribute and the boundary
  lands on the bisector. Phase 5 replaces the naked min with an endpoint-
  aware classifier — the extension point is labeled in the code.

- Crispness gate: the AA window is always at least one pixel wide, and
  the effective halfWidth is max(strokeHalfWidth, aaHalf). Sub-pixel
  strokes widen to a visible 1px outline instead of vanishing below
  fwidth — matches FreeType thickening for hairlines.

- Reference stroke-coverage test exercises the defining behaviors:
  straight-segment center/outside/AA-window, closed-square bevel at
  exterior corner (vs miter which would extend), sharp A-apex bevel
  clips at the perpendicular bisector.

GPU-vs-CPU parity lands once SlugStrokeMaterial + SlugText.outline wire
up in Tasks 11-12. The TSL math and the CPU reference are line-for-line
identical, so the remaining risk is in the material/dilation plumbing.
Files: packages/slug/src/shaders/distanceToQuadBezier.ts, packages/slug/src/shaders/slugStroke.test.ts, packages/slug/src/shaders/slugStroke.ts
Stats: 3 files changed, 448 insertions(+), 2 deletions(-)

### 8ef8b8c0dd2c998521ea57c4bb3787794ff55b37
feat: analytic distance-to-curve primitive
Phase 4 Task 9 — pure-JS reference for closest-point-on-quadratic-Bezier.
The stroke fragment shader (Task 10) will port this to TSL.

- Cubic critical-point equation dD/dt = 0 where D(t) = |B(t) - P|².
  Coefficients derived from A = p2-2p1+p0, D = p1-p0, M = p0-P.
- Newton refinement from seeds t ∈ {0, 0.5, 1} with [0,1] clamping.
  Handles multi-stationary-point curves (S-shape test) by spreading
  seeds across the parameter range. Endpoint samples (t=0, t=1)
  included as candidates so projections outside the curve segment
  fall through to the nearest control point — matches the "endpoint
  hit" classification the Phase 5 join logic will dispatch on.
- Degenerate point (p0=p1=p2): early return with Euclidean distance.
  Degenerate line (A≈0): cubic collapses to linear and Newton from
  t=0.5 converges in one step to the projection.

Also updates the Phase 4 / Phase 5 roadmap to reflect the 2026-04-14
re-scoping discussed in planning:
- Phase 4 ships bevel-via-min joins + runtime-uniform width + crispness
  gate. No explicit miter, no caps, no dashing, no baked-format bump.
- Phase 5 owns the full SVG stroke surface — miter/round/bevel joins
  with miterLimit fallback, all four cap styles (flat/square/round/
  triangle), dashing with dashOffset via arc-length tables, plus
  SlugShapeBatch and the SVG path-d parser. 3-texel curve layout
  with neighbor tangents lands here with the BAKED_VERSION bump.
- Phase 4 reserves uniform slots for Phase 5's joinStyle/miterLimit/
  capStyle so Phase 5's material extension is strictly additive.

Tests: 11 cases — straight line (projection + clamps + on-curve),
quarter-arc symmetric (origin, endpoints, outside clamps), degenerate
point, brute-force monotone-convergence check, S-curve two-critical-
point check to catch Newton locking onto the wrong stationary point.
Files: packages/slug/src/shaders/distanceToQuadBezier.test.ts, packages/slug/src/shaders/distanceToQuadBezier.ts, planning/superpowers/plans/2026-04-13-slug-feature-roadmap.md
Stats: 3 files changed, 1046 insertions(+)

### ce7740aceb382bf7901b8c551a65942a969d0e93
feat: SlugFontStack.wrapText + icon-fallback demo + pipeline robustness
Library:

- SlugFontStack.wrapText(text, fontSize, maxWidth?) → string[] — per-
  codepoint font resolution with the same break-at-last-space +
  hard-break-fallback policy as shapeStackText. Enables external
  renderers (Canvas2D overlays, DOM mirrors) to stay line-for-line with
  SlugStackText output when content mixes fonts. Backed by a new
  pipeline/wrapLinesStack.ts.
- parseFont now emits advance-only glyph entries (empty curves/bounds,
  real advanceWidth) for cmap'd glyphs with no outline — space, tab,
  zero-width controls. Matches the bake CLI's post-pass so shapeStackText
  resolves the correct advance regardless of whether a primary font was
  loaded runtime or baked.
- Runtime shapers pass `{ features: [] }` to stringToGlyphs in
  textShaper / wrapLines / textMeasure. opentype.js's default Latin
  features apply `liga`/`rlig` and mark component tokens deleted, which
  shortened the returned array vs text.length and drifted the
  text[i]===' '/'\n' checks used for word boundaries — visible as
  whitespace collapse at wrap points in LOREM. Baked path already
  iterates text.length, so aligning runtime semantics matches the two.
- SlugText._setFont no longer flips visible=true before the first
  _rebuild. R3F can render once between prop-set and first useFrame; on
  that pass TSL would build a pipeline against an uninitialized instance
  buffer and WebGPU rejected the frame with
  "Binding size is zero ... is invalid due to a previous error",
  silently blanking the canvas. Visibility now toggles inside _rebuild
  once real glyph data is written, and flips off again when empty.
- SlugFontLoader: BAKED_VERSION machinery removed — package isn't
  released yet, no migration story to maintain. baked.ts, loader,
  exports, and baked.test.ts updated together.
- CLI: slug-bake gained --output / -o for custom output bases.
- SlugFont.hasCharCode: codepoint coverage check consulted by
  SlugFontStack.resolveCodepoint for per-codepoint fallback routing.

Tweakpane:

- New usePaneRadioGrid hook (react subpath) backed by essentials'
  radiogrid blade. Inline button-bar selector with an active-state
  affordance that reads better than a dropdown for scene/mode toggles.
  Deferred disposal + synchronous creation mirror the existing
  usePaneButton/usePaneInput pattern.
- Theme: checkbox box surface now matches the other controls
  (rgba(28,40,77,0.6)) with hover/focus/active parity, and the check
  stroke turns accent pink on :checked. Default tweakpane box blended
  with the container — the hit target was essentially invisible.

Examples (React + Three, 1:1 parity):

- Top-of-pane [Lorem | Icons] radio toggle selects the rendered scene.
  'lorem' renders plain SlugText; 'icons' renders SlugStackText against
  a [Inter, FA-Solid] stack and switches the Canvas2D compare to
  'Inter-Slug, FA-Solid, sans-serif' so the browser's per-codepoint
  fallback mirrors the Slug stack. Measure overlay hides in icons mode
  (primary-only metrics would misreport FA glyphs), compare stays live.
- ICON_DEMO uses FA-Solid PUA codepoints baked with slug-bake for a
  12-icon subset (fa-solid.slug.{json,bin}, ~71KB bin). fa-solid-900.ttf
  is served for the Canvas2D @font-face fallback only.
- @font-face for FA-Solid declared with font-weight: normal so Canvas2D's
  default weight-400 ctx.font matches instead of falling through to
  sans-serif ("no glyph" boxes). Both examples preload Inter-Slug and
  FA-Solid via document.fonts.load before first paint.
- React font loading: dropped SlugFontLoader.clearCache (the static
  cache is already keyed on url:runtime?), added .catch on both Inter
  and FA loads so network/404 rejections surface in the console instead
  of a blank canvas.
- Compare overlay uses stack.wrapText when icons mode is on so line
  breaks agree with SlugStackText at any maxWidth — drawCompareText
  takes a preWrappedLines?: string[] override in place of the earlier
  useHardBreaks flag, and SlugStackText is back on maxWidth in both
  examples.
Files: examples/react/slug-text/App.tsx, examples/react/slug-text/index.html, examples/react/slug-text/public/Inter-Regular.slug.json, examples/react/slug-text/public/fa-solid-900.ttf, examples/react/slug-text/public/fa-solid.slug.bin, examples/react/slug-text/public/fa-solid.slug.json, examples/three/slug-text/index.html, examples/three/slug-text/main.ts, examples/three/slug-text/public/Inter-Regular.slug.json, examples/three/slug-text/public/fa-solid-900.ttf, examples/three/slug-text/public/fa-solid.slug.bin, examples/three/slug-text/public/fa-solid.slug.json, packages/slug/src/SlugFontLoader.ts, packages/slug/src/SlugFontStack.ts, packages/slug/src/SlugText.ts, packages/slug/src/baked.test.ts, packages/slug/src/baked.ts, packages/slug/src/cli.ts, packages/slug/src/index.ts, packages/slug/src/pipeline/fontParser.ts, packages/slug/src/pipeline/textMeasure.ts, packages/slug/src/pipeline/textShaper.ts, packages/slug/src/pipeline/wrapLines.ts, packages/slug/src/pipeline/wrapLinesStack.ts, packages/slug/src/react/types.ts, packages/tweakpane/src/react.ts, packages/tweakpane/src/react/use-pane-radio-grid.ts, packages/tweakpane/src/theme.ts
Stats: 28 files changed, 600 insertions(+), 68 deletions(-)

### b610dc29e264cfc7d562dfaecf58e2e79dc9d49d
feat: SlugFontStack — per-codepoint glyph fallback chain
Phase 3 library-side. Adds the manual-aligned font-map fallback model
(Slug §4.6): an ordered list of fonts, walked per codepoint, first
matching font wins. Codepoints no font in the chain covers fall back
to the primary's notdef rectangle.

- SlugFontStack(fonts: SlugFont[]) — chain wrapper. resolveCodepoint(c)
  walks the chain and returns the index of the first covering font.
  resolveText(text) yields per-character font assignments.
- SlugFont.hasCharCode(c) — cheap codepoint-coverage check via the
  font's cmap (baked: cmapLookup; runtime: opentype charToGlyph).
- pipeline/textShaperStack.ts — wrap-aware shaper that walks codepoints,
  resolves to a font per char, advances a single global cursor, and
  emits positioned glyphs grouped by font index. Drops kerning across
  font-run boundaries; preserves it within same-font runs. Honours the
  same line-height / align / maxWidth options and Slug wrap policy as
  the single-font shapers.
- SlugStackText extends Group — multi-font renderable with one
  InstancedMesh child per font in the stack so each font's distinct
  curve+band textures can be bound per draw call. One draw per font
  that contributes glyphs to the current text.

Tests cover stack construction, per-codepoint resolution, single-font
parity with the existing shaper, and wrap behavior.

The example update (loading a fallback font + demonstrating emoji
substitution) is deferred to a follow-up — needs an emoji font asset
(~MB) sourced and committed.
Files: packages/slug/src/SlugFont.ts, packages/slug/src/SlugFontStack.test.ts, packages/slug/src/SlugFontStack.ts, packages/slug/src/SlugStackText.ts, packages/slug/src/index.ts, packages/slug/src/pipeline/textShaperStack.ts
Stats: 6 files changed, 612 insertions(+)

### 29712f8f74056ab7e99818b2904813e7e419ee5d
feat: underline + strikethrough decorations
Phase 2 first slice — text decoration rendering via the StyleSpan API.

Library:

- SlugFont exposes font-declared decoration metrics (underlinePosition,
  underlineThickness, strikethroughPosition, strikethroughThickness) and
  script defaults (subscriptScale/Offset, superscriptScale/Offset). All
  sourced from OpenType post + os2 tables at parseFont time and baked
  into BakedJSON.metrics. BAKED_VERSION 3 → 4; included fixtures
  re-baked.
- StyleSpan { start, end, underline?, strike?, scriptLevel? } —
  manual-aligned shape per Slug §2.7/§2.8. scriptLevel is reserved for
  the next slice; underline/strike are live now.
- pipeline/decorations.ts: emitDecorations(text, positioned, styles,
  fontSize, metrics, glyphAdvances) → DecorationRect[]. Pure post-pass
  over shaped glyphs; one rect per (line, kind, contiguous-styled-run).
  Uses the new srcCharIndex on PositionedGlyph for unambiguous
  glyph→char mapping.
- SlugFont.emitDecorations(text, positioned, styles, fontSize) — thin
  wrapper using the font's own metrics + advance map.
- SlugGeometry.setGlyphs accepts an optional decorations array;
  appends them as rect-sentinel instances (glyphJac.w = -1) after the
  glyph instances so they render in the same draw call.
- SlugMaterial fragment shader detects the rect sentinel and short-
  circuits coverage to 1 instead of running the curve evaluator.
- SlugText accepts styles?: StyleSpan[] (constructor + runtime setter)
  and threads through shaper + decoration emission.

Both shapers (runtime + baked) now set srcCharIndex on each pushed
PositionedGlyph for downstream style passes.

Examples (React + Three, 1:1 parity):

- New Styles folder demonstrating the public StyleSpan API by applying
  underline/strike to a preset scope (First word / First sentence /
  First line). Honest about the API surface — arbitrary character-range
  selection is rich-text editor territory and stays in Phase 6.
- Hover any rendered line → measure overlay (cyan tight ink, yellow
  dashed font envelope) + monitors update live; mouse out clears.
  Replaces the previous click-to-measure + click-to-style combination
  with two cleanly separated, orthogonal interactions.
Files: examples/react/slug-text/App.tsx, examples/react/slug-text/public/Inter-Regular.slug.json, examples/three/slug-text/main.ts, examples/three/slug-text/public/Inter-Regular.slug.json, packages/slug/src/SlugFont.ts, packages/slug/src/SlugFontLoader.ts, packages/slug/src/SlugGeometry.ts, packages/slug/src/SlugMaterial.ts, packages/slug/src/SlugText.ts, packages/slug/src/baked.ts, packages/slug/src/cli.ts, packages/slug/src/index.ts, packages/slug/src/pipeline/decorations.test.ts, packages/slug/src/pipeline/decorations.ts, packages/slug/src/pipeline/fontParser.ts, packages/slug/src/pipeline/textShaper.ts, packages/slug/src/pipeline/textShaperBaked.ts, packages/slug/src/types.ts
Stats: 18 files changed, 741 insertions(+), 95 deletions(-)

### 5a2e36311e38494e9640fd565480398f781dde0c
feat: font.measureText + measureParagraph APIs
Phase 1 measurement surface on SlugFont:

- measureText(text, fontSize) → TextMetrics
  Spiritually aligned with CanvasRenderingContext2D.measureText: single
  line, no wrap, same-named fields (width, actualBoundingBox{Left,Right,
  Ascent,Descent}, fontBoundingBox{Ascent,Descent}). Dispatches to a
  baked- or runtime-backed impl via the same loader-injection pattern
  as shapeText/wrapText — opentype.js stays lazy for the baked path.

- measureParagraph(text, fontSize, { maxWidth?, lineHeight? })
  → ParagraphMetrics. Multi-line convenience over wrapText +
  per-line measureText. Respects the same lineHeight default (1.2) as
  SlugText so measured height matches rendered height.

Implementation details:

- Runtime measure reads pre-computed SlugGlyphData.bounds instead of
  opentype's glyph.getBoundingBox() — that method iterates path commands
  per call; the bounds are already computed once at parseFont time.
  Makes per-call cost constant regardless of glyph complexity; zero
  memory overhead.

- Baked measure uses bounds-area (xMax > xMin) to gate ink accumulation
  because unpackBaked discards the curve list at runtime (curves live
  only in the GPU texture). The prior `curves.length > 0` heuristic
  silently returned zero ink bounds for every glyph on the baked path.
  Regression test added.

- tweakpane: extend PaneInputOptions with `readonly` + `format` so
  React hook users can create readonly monitors with formatters.

Example Measure folder (both React + Three, 1:1 parity):

- Click any rendered line to select it. Click again or a different
  line to swap. Selected line shows cyan (actual/ink) and dashed yellow
  (font envelope) overlays; monitors populate with that line's
  width / actual↑↓ / font↑↓. Click-to-measure replaces the earlier
  checkbox+text-input UX that was hard to discover.

- Paragraph monitors (block w / block h / lines) live-update for the
  currently-rendered block.

- Renderer flipped to antialias: false — Slug computes analytic
  per-fragment coverage so MSAA is 4× sample cost for zero visual gain.
Files: examples/react/slug-text/App.tsx, examples/three/slug-text/index.html, examples/three/slug-text/main.ts, packages/slug/scripts/inspect-bounds.ts, packages/slug/src/SlugFont.ts, packages/slug/src/SlugFontLoader.ts, packages/slug/src/index.ts, packages/slug/src/measureParagraph.test.ts, packages/slug/src/pipeline/textMeasure.test.ts, packages/slug/src/pipeline/textMeasure.ts, packages/slug/src/pipeline/textMeasureBaked.test.ts, packages/slug/src/pipeline/textMeasureBaked.ts, packages/slug/src/types.ts, packages/tweakpane/src/react/use-pane-input.ts
Stats: 14 files changed, 995 insertions(+), 5 deletions(-)

### e0e63628a9eb1d5760f47600d4ec6c7d06bbf24a
perf: halve curves/band + skip non-crossing curves in shader
Second pass on Slug perf — modest but real on text-heavy workloads.

- bandCount 8 → 16: halving the band cell size roughly halves the
  expected curves per band (mean 6.3 → ~3.2, p99 18 → ~10). Fragment
  ALU scales linearly with curves/band, so less per-fragment work in
  the hot loop. Band-ref duplication across overlapping bands grows
  the band texture ~1.5× (7.1 MB → 11.2 MB .slug.bin), acceptable cost
  for a font library.
- Shader: wrap the post-rootCode solve + coverage + weight work in
  `If(rootCode > 0)`. About 30% of curves in a band don't cross the
  ray at the fragment's position; those skip the sqrt + divisions +
  saturates entirely. Branch coherence helps on blocks of empty space.

Diminishing returns from here require structural changes (bounding
polygon, small-ppem SDF atlas) that are tracked as future work.
Files: examples/react/slug-text/public/Inter-Regular.slug.bin, examples/react/slug-text/public/Inter-Regular.slug.json, examples/three/slug-text/public/Inter-Regular.slug.bin, examples/three/slug-text/public/Inter-Regular.slug.json, packages/slug/src/pipeline/bandBuilder.ts, packages/slug/src/pipeline/fontParser.test.ts, packages/slug/src/shaders/slugFragment.ts
Stats: 7 files changed, 58 insertions(+), 46 deletions(-)

### 3e7d607b7a27d5ec53ff118052f0fd62a2b2ded0
perf: half texture bandwidth + tighter shader loop bound
Three changes that together drop GPU time ~20% on bandwidth-heavy workloads:

- curveTexture → RGBA16F (HalfFloatType): 8 bytes/texel vs 16. Em-space
  coords are bounded to ~[-1, +1.25]; half-float's ~11-bit mantissa is
  subpixel-accurate at all realistic rendering sizes. Values converted
  at bake time via DataUtils.toHalfFloat.
- bandTexture → RG32F: 8 bytes/texel vs 16. The old packing reserved 4
  float channels per texel but only wrote to 2, wasting half the
  bandwidth.
- MAX_CURVES_PER_BAND 64 → 40: analysis of Inter's full 2849-glyph
  corpus shows p999 band fill = 25 curves, max = 38. 40 covers 100% of
  real content with a safety margin; the old 64 inflated shader register
  pressure. Added a bake-time warning in cli.ts when any band exceeds
  the shader bound.

BAKED_VERSION bumped 2 → 3; old .slug.bin/.json files must be re-run
through `slug-bake`. Included fixtures re-baked (13 MB → 7.1 MB, ~45%
smaller on disk).

Also added packages/slug/scripts/analyze-bands.ts for future tuning.
Files: examples/react/slug-text/public/Inter-Regular.slug.bin, examples/react/slug-text/public/Inter-Regular.slug.json, examples/three/slug-text/public/Inter-Regular.slug.bin, examples/three/slug-text/public/Inter-Regular.slug.json, packages/slug/scripts/analyze-bands.ts, packages/slug/src/SlugFontLoader.ts, packages/slug/src/baked.test.ts, packages/slug/src/baked.ts, packages/slug/src/cli.ts, packages/slug/src/pipeline/texturePacker.test.ts, packages/slug/src/pipeline/texturePacker.ts, packages/slug/src/shaders/slugFragment.ts
Stats: 12 files changed, 187 insertions(+), 59 deletions(-)

### 7b51a147e4e21544073ab4db6f5e1ac4b0a37fbc
refactor: relocate vanilla→three and achieve example parity
- Move examples/vanilla/slug-text → examples/three/slug-text to match the
  post-rename convention. Rename the package to example-three-slug-text.
- Remove both standalone slug-text entries from microfrontends.json; the
  shared examples MPA auto-discovers examples/{three,react}/*/index.html
  via its Vite config, so no per-example MFE port is needed.
- Fix paths that broke in the move: vite.config.ts base, relative script
  and @font-face asset URLs in index.html, BASE_URL references in main.ts
  and App.tsx, slug test fixture paths.
- Update docs/examples/slug-text.mdx to use loadExample('three', ...).

Port the three example's Canvas2D comparison UX to React for parity:
- Full-screen Canvas2D overlay with onion / split / diff modes.
- Draggable split handle with clip-path reveal; mode labels on both sides.
- Diff mode: luminance-weighted heatmap against the R3F WebGPU canvas
  (exposed via a CanvasGrabber child inside <Canvas>).
- Computing indicator during diff compute.
- Word count slider, compare-mode radio, matching the three example.
- Replaces HtmlOverlay; R3F idioms throughout (hooks, declarative
  components, no DOM queries).

Add SlugFont.wrapText(text, fontSize, maxWidth?) → string[]:
- Dispatches on baked vs runtime path (same pattern as shapeText).
- pipeline/wrapLines.ts (opentype) + pipeline/wrapLinesBaked.ts (baked).
- Used by both examples' Canvas2D comparison so line breaks match Slug's
  shaped output exactly — browser hinting at medium font sizes (48/72/96)
  was shrinking ctx.measureText widths below opentype-derived advances,
  producing different line counts and breaking vertical alignment.
Files: docs/src/content/docs/examples/slug-text.mdx, examples/react/slug-text/App.tsx, examples/react/slug-text/index.html, examples/three/slug-text/index.html, examples/three/slug-text/main.ts, examples/three/slug-text/package.json, examples/three/slug-text/public/Inter-Regular.slug.bin, examples/three/slug-text/public/Inter-Regular.slug.json, examples/three/slug-text/public/Inter-Regular.ttf, examples/three/slug-text/tsconfig.json, examples/three/slug-text/vite.config.ts, examples/vanilla/slug-text/index.html, examples/vanilla/slug-text/main.ts, examples/vanilla/slug-text/package.json, examples/vanilla/slug-text/public/Inter-Regular.slug.bin, examples/vanilla/slug-text/public/Inter-Regular.slug.json, examples/vanilla/slug-text/public/Inter-Regular.ttf, examples/vanilla/slug-text/tsconfig.json, examples/vanilla/slug-text/vite.config.ts, microfrontends.json, packages/slug/src/SlugFont.ts, packages/slug/src/SlugFontLoader.ts, packages/slug/src/baked.test.ts, packages/slug/src/pipeline/fontParser.test.ts, packages/slug/src/pipeline/textShaper.test.ts, packages/slug/src/pipeline/texturePacker.test.ts, packages/slug/src/pipeline/wrapLines.ts, packages/slug/src/pipeline/wrapLinesBaked.ts, pnpm-lock.yaml
Stats: 29 files changed, 1399 insertions(+), 867 deletions(-)

### 9ef548d938e2491c516436fdb0456822fe7747cd
feat: add stem darkening and thickening options to SlugMaterial and SlugText; update coverage calculations
Files: packages/slug/src/SlugMaterial.ts, packages/slug/src/SlugText.ts, packages/slug/src/pipeline/textShaper.test.ts, packages/slug/src/pipeline/textShaper.ts, packages/slug/src/pipeline/textShaperBaked.ts, packages/slug/src/shaders/calcCoverage.ts, packages/slug/src/shaders/reference.test.ts, packages/slug/src/shaders/reference.ts, packages/slug/src/shaders/slugFragment.ts, packages/slug/src/types.ts
Stats: 10 files changed, 400 insertions(+), 41 deletions(-)

### c70b675943647b0fbfdc94a82b1b1b1091b0eaa8
fix: update peer dependency for three to use catalog
Files: packages/slug/package.json
Stats: 1 file changed, 1 insertion(+), 1 deletion(-)

### 6363fe63cd32ab22fb6537259f996cbb9969d6bb
feat: add baked font data handling with CLI tool for SlugFont
Files: docs/astro.config.mjs, docs/src/content/docs/examples/slug-text.mdx, docs/src/content/docs/guides/slug-text.mdx, examples/react/slug-text/App.tsx, examples/react/slug-text/public/Inter-Regular.slug.bin, examples/react/slug-text/public/Inter-Regular.slug.json, examples/vanilla/slug-text/index.html, examples/vanilla/slug-text/main.ts, examples/vanilla/slug-text/public/Inter-Regular.slug.bin, examples/vanilla/slug-text/public/Inter-Regular.slug.json, packages/slug/README.md, packages/slug/package.json, packages/slug/src/SlugFont.ts, packages/slug/src/SlugFontLoader.ts, packages/slug/src/baked.test.ts, packages/slug/src/baked.ts, packages/slug/src/cli.ts, packages/slug/src/index.ts, packages/slug/src/pipeline/textShaperBaked.ts
Stats: 19 files changed, 1609 insertions(+), 110 deletions(-)

### 881c08df3ea6e5f559374a13fe25ae13078c8271
feat: add example React app with SlugText integration and basic UI controls
Files: examples/react/slug-text/App.tsx, examples/react/slug-text/index.html, examples/react/slug-text/main.tsx, examples/react/slug-text/package.json, examples/react/slug-text/public/Inter-Regular.ttf, examples/react/slug-text/tsconfig.json, examples/react/slug-text/vite.config.ts, microfrontends.json, packages/slug/src/SlugText.ts, pnpm-lock.yaml
Stats: 10 files changed, 489 insertions(+)

### 2d4cf0449ecb4323714245af5fe5bd1e434d5e24
feat: implement dynamic dilation for quad rendering in SlugMaterial
Files: packages/slug/src/SlugMaterial.ts
Stats: 1 file changed, 8 insertions(+), 8 deletions(-)

### 550dd5abc5effe4a586df53438b225166e181fc5
feat: fix LINE_EPSILON, add html overlay to compare
Files: examples/vanilla/slug-text/index.html, examples/vanilla/slug-text/main.ts, packages/slug/src/pipeline/fontParser.ts
Stats: 3 files changed, 81 insertions(+), 34 deletions(-)

### 631c68d564b278ce66fc0786e3a991343eaa0acd
feat: debugging through rendering
Files: examples/vanilla/slug-text/main.ts, packages/slug/src/SlugGeometry.ts, packages/slug/src/SlugMaterial.ts, packages/slug/src/SlugText.ts
Stats: 4 files changed, 41 insertions(+), 25 deletions(-)

### 78e3971b657a890047275f1eef00789ba1d7218c
feat: enhance texture packing with endpoint sharing and add slugDilate shader
Files: packages/slug/src/SlugGeometry.ts, packages/slug/src/SlugMaterial.ts, packages/slug/src/SlugText.ts, packages/slug/src/pipeline/bandBuilder.test.ts, packages/slug/src/pipeline/fontParser.test.ts, packages/slug/src/pipeline/fontParser.ts, packages/slug/src/pipeline/textShaper.ts, packages/slug/src/pipeline/texturePacker.test.ts, packages/slug/src/pipeline/texturePacker.ts, packages/slug/src/shaders/calcCoverage.ts, packages/slug/src/shaders/index.ts, packages/slug/src/shaders/reference.test.ts, packages/slug/src/shaders/reference.ts, packages/slug/src/shaders/slugDilate.ts, packages/slug/src/shaders/slugFragment.ts, packages/slug/src/types.ts
Stats: 16 files changed, 1080 insertions(+), 128 deletions(-)

### 92f59cf8002fd1cc56106366d08a2ff1ae9b1ffa
feat: add Slug text rendering pipeline with font parsing, text shaping, and GPU texture packing
Files: packages/slug/LICENSE, packages/slug/README.md, packages/slug/THIRD_PARTY_LICENSES, packages/slug/docs/ARCHITECTURE.md, packages/slug/docs/REFERENCE.md, packages/slug/package.json, packages/slug/src/SlugFont.ts, packages/slug/src/SlugGeometry.ts, packages/slug/src/SlugMaterial.ts, packages/slug/src/SlugText.ts, packages/slug/src/index.ts, packages/slug/src/pipeline/bandBuilder.ts, packages/slug/src/pipeline/fontParser.ts, packages/slug/src/pipeline/index.ts, packages/slug/src/pipeline/textShaper.ts, packages/slug/src/pipeline/texturePacker.ts, packages/slug/src/react.ts, packages/slug/src/react/index.ts, packages/slug/src/react/types.ts, packages/slug/src/shaders/calcCoverage.ts, packages/slug/src/shaders/calcRootCode.ts, packages/slug/src/shaders/index.ts, packages/slug/src/shaders/slugFragment.ts, packages/slug/src/shaders/slugVertex.ts, packages/slug/src/shaders/solveQuadratic.ts, packages/slug/src/types.ts, packages/slug/tsconfig.json, packages/slug/tsup.config.ts
Stats: 28 files changed, 2774 insertions(+)

---
"@three-flatland/tweakpane": minor
---

> Branch: mini-game-showcase
> PR: https://github.com/thejustinwalsh/three-flatland/pull/59

### New APIs

- `usePaneRadioGrid` hook (react subpath) — inline button-bar selector backed by essentials' `radiogrid` blade; deferred disposal + synchronous creation mirror `usePaneButton` / `usePaneInput`
- `PaneInputOptions` extended with `readonly` and `format` fields — allows readonly monitors with custom formatters via the existing `usePaneInput` hook

### Fixed

- Checkbox hit target expanded to full 20×20 box — `.tp-ckbv_i` now fills `var(--cnt-usz)` × `var(--cnt-usz)`, clicks land directly on the input instead of relying on flaky `<label>` forwarding under pointer-events + z-index combinations
- `z-index: 1000` applied to the `.tp-dfwv` body-sibling wrapper rather than the inner pane element — pane now correctly layers above other overlays
- Checkbox surface style updated to `rgba(28,40,77,0.6)` with hover/focus/active parity; check stroke switches to accent pink on `:checked`
- DPR tracking in `useWindowSize` extended to include `dpr` field and a `(resolution: Ndppx)` media query — monitor swaps now trigger canvas re-size
- `document.fullscreenchange` listener added alongside `resize` — fullscreen exit now re-measures at the correct viewport size after layout settles

Adds `usePaneRadioGrid`, readonly monitor support, and fixes checkbox hit target, pane z-index stacking, and DPR/fullscreen synchronization.

### b90509fa9cec75766d96e36d7f3b11126f70839f
fix: DPR + fullscreen tracking, checkbox hit target
Three cross-cutting bugs hit between Phase 4 finishing and Phase 5
starting. Clean them up so they don't confuse regression gating while
Phase 5 lands.

1) Overlay desync on resolution change.

   `useWindowSize` tracked (w, h) only, reading `window.devicePixelRatio`
   inside the compare-canvas sizing effect. Monitor swaps change DPR
   without changing dimensions, so the sizing effect didn't re-run and
   the canvas stayed at the old DPR. Compare overlay desynced from the
   WebGPU canvas which re-uses three.js's live pixel-ratio.

   Fix: hook now tracks `{ w, h, dpr }` and subscribes to a
   `(resolution: Ndppx)` media query. Monitor swap fires the listener,
   state updates, canvas re-sizes. Media query is re-attached on each
   change because the matched resolution changes. CompareCanvas reads
   `windowSize.dpr` instead of `window.*`.

2) Fullscreen-return wonky state.

   The 'resize' event browsers fire during fullscreen enter/exit
   sometimes lands before the viewport metrics have finished updating,
   leaving innerWidth/innerHeight stale for one tick.

   Fix: listen to `document.fullscreenchange` in addition to resize.
   On fullscreen change, re-measure immediately + once more in the
   next RAF, catching post-transition layout settles.

   Three example gets a unified `relayout()` helper routing resize +
   DPR media-query + fullscreenchange through one path, including
   `renderer.setPixelRatio` so monitor swaps produce a sharp canvas.

3) Checkboxes requiring multiple clicks.

   Tweakpane's hidden input ships at browser-default size (~13x13)
   absolute-positioned at top-left of the 20x20 label, relying on
   <label> -> <input> click forwarding for the visible area. That
   forwarding is flaky under pointer-events + z-index combinations
   (some browsers / browser modes swallow forwarded clicks).

   Fix: stretch `.tp-ckbv_i` to the full box size with explicit
   `width/height: var(--cnt-usz)`. The invisible input now covers
   the whole visible box - clicks land on the input directly, no
   label forwarding required.

All 188 tests still pass, typechecks clean on slug + tweakpane +
both examples, no public API changes.
Files: examples/react/slug-text/App.tsx, examples/three/slug-text/main.ts, packages/tweakpane/src/theme.ts
Stats: 3 files changed, 100 insertions(+), 11 deletions(-)

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

### fd4b7e67a67d61c94e13b51d3f92d4c5b511d64e
refactor: migrate to @three-flatland/tweakpane
- Replace Web Awesome controls with tweakpane in both Three and React
  examples. Both now have identical Settings + Mode folders (collapsed
  by default) binding the same parameters.
- React: switch to usePane + usePaneFolder + usePaneInput, add
  useStatsMonitor via a <StatsTracker> child inside <Canvas>, set
  trackTimestamp: true on the renderer so GPU-time mode works.
- Three: createPane with stats, wrap the render loop with
  stats.begin() / stats.end() and feed stats.update() with renderer.info
  each frame.
- Drop all @awesome.me/webawesome imports, CSS, wa-* selectors, and
  the useWrappingGroup / setupWrappingGroup helpers. Drop the status
  div (readonly tweakpane monitors cover it).
- Lower overlay z-indexes to 1–4 so the tweakpane wrapper (z-index 1000)
  clearly sits above. Move computing spinner from top-right → top-left
  so it doesn't fight for the tweakpane corner.
- Keep split labels at the top, add `white-space: nowrap` so mode labels
  like "Canvas (Onion Skin)" don't line-break in narrow viewports.

fix(tweakpane): apply z-index: 1000 to the .tp-dfwv wrapper

pane.element is the inner pane root — the actual body-sibling stacking
context is the default .tp-dfwv wrapper tweakpane creates when no
container is provided. Setting z-index on the inner element had no
effect on how tweakpane stacked against other overlays; apply to the
wrapper when it exists.
Files: examples/react/slug-text/App.tsx, examples/react/slug-text/index.html, examples/react/slug-text/package.json, examples/three/slug-text/index.html, examples/three/slug-text/main.ts, examples/three/slug-text/package.json, packages/tweakpane/src/create-pane.ts, pnpm-lock.yaml
Stats: 8 files changed, 188 insertions(+), 703 deletions(-)

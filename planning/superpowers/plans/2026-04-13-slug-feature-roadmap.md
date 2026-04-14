# Slug Text — PR #20 Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the feature requests from @astralarya on https://github.com/thejustinwalsh/three-flatland/pull/20 by extending `@three-flatland/slug` with font fallback, measurement, styles, stroked outlines, generic vector shapes, and a rich-text API.

**Architecture:** Current package already renders fills via winding-number coverage and has a baked/runtime shaper, notdef fallback, pixel snap, dilation, stem-darkening/thickening, and instanced per-glyph attributes (`glyphPos`/`glyphTex`/`glyphJac`/`glyphBand`/`glyphColor`). Each feature is layered on top:
- Measurement exposes the existing shaper data through a pure API.
- Multi-font fallback lives in shaping (composite `SlugFontStack`), leaving the single-font GPU path untouched by rendering differently-textured glyphs as multiple draw calls (one `SlugText` instance per font in the stack, unified by a parent `Object3D`).
- Styles (underline/strike/super/sub) are implemented as extra positioned primitives (rects + glyph offsets/scales) fed through the same `SlugGeometry`/`SlugMaterial` — no shader change.
- Stroked outlines and generic vector shapes require a new fragment path that evaluates signed distance to the nearest curve alongside the existing coverage evaluation. They share the curve/band texture layout; a new `SlugShape` + `SlugStrokeMaterial` pair is added.
- Rich text is a data model (`RichText` tree / tagged-span array) that compiles down to the primitives above — no new GPU path.

**Tech Stack:** TypeScript, Three.js r174+ (WebGPU + TSL), opentype.js (runtime only), vitest, R3F wrappers.

**Per-phase ship gate (non-negotiable):** every feature phase ends with an example update that exposes the feature as a live Tweakpane control in both `examples/three/slug-text/` and `examples/react/slug-text/` (or a new paired example for Phase 5 shapes / Phase 6 rich text). The phase does not ship and the next phase does not begin until the control exists, the user has clicked through it in a dev build, and it visibly works. Unit tests + crispness goldens are required but not sufficient — interactive verification is the merge gate.

**Package feature status (audited 2026-04-13 on `feat-slug` @ rebased HEAD):**

| Feedback item | Current state | Notes |
|---|---|---|
| Multiple fonts / glyph fallback | Only notdef rect fallback (`textShaperBaked.ts:52`, `cli.ts:131`). No multi-font composition. | Need `SlugFontStack` |
| Font metrics / measurement | Metrics live on `SlugFont` (`unitsPerEm`, `ascender`, `descender`, `capHeight`) but no public `measureText()` / `measureSpan()` API. Line/span widths are computed privately inside both shapers. | Extract + expose |
| Font outlines (Slug manual p.45) | Not implemented. Roadmap item: "General shape rendering (SVG paths, icons)". Only fill winding-number path exists. | New shader path |
| Vector graphics fill+stroke (Slug manual ch.3) | Not implemented. | New package module |
| Font styles (underline / strike / super / sub) | Not implemented. | Data model + layout |
| Rich text | Not implemented. | New API atop shaper |

---

## Phase 0z — Relocate Example to `examples/three/` (before Tweakpane migration)

The PR-20 branch put the Three-side example under `examples/three/slug-text/` and registered both slug-text examples as standalone microfrontends. Post-rename on `main`:
- Vanilla → Three: examples live at `examples/three/<name>/` alongside `examples/react/<name>/` (CLAUDE.md: "`examples/three/` = plain Three.js, `examples/react/` = React Three Fiber").
- Standalone MFEs were consolidated — the shared `examples/` app (port 5174) auto-discovers every `examples/{three,react}/*/index.html` via `examples/vite.config.ts:discoverExamples()` and serves them at `/three/<name>` and `/react/<name>`. Individual example packages still have their own `package.json`, but they do **not** get their own `microfrontends.json` entry.

### Task 0z.1 — Move + rename

- [ ] **Step 0z.1.1** — `git mv examples/vanilla/slug-text examples/three/slug-text && rmdir examples/vanilla` (it will only contain slug-text; if anything else landed there, flag it).
- [ ] **Step 0z.1.2** — Rename package in `examples/three/slug-text/package.json`: `"name": "example-three-slug-text"` → `"example-three-slug-text"`.
- [ ] **Step 0z.1.3** — Delete both per-example entries from `microfrontends.json` (keep only `docs` and `examples`). The example will be auto-served at `http://localhost:5173/three/slug-text` and `/react/slug-text` by the shared MPA; drop the custom ports 4017/4018.
- [ ] **Step 0z.1.4** — Fix test fixture paths in 4 files:
  - `packages/slug/src/baked.test.ts:10`
  - `packages/slug/src/pipeline/textShaper.test.ts:7`
  - `packages/slug/src/pipeline/texturePacker.test.ts:7`
  - `packages/slug/src/pipeline/fontParser.test.ts:6`
  Replace `examples/vanilla/slug-text` with `examples/three/slug-text` (exact string) in each.
- [ ] **Step 0z.1.5** — `pnpm install` to regenerate `pnpm-lock.yaml` entries keyed by the new package name. `pnpm sync:pack:verify`.
- [ ] **Step 0z.1.6** — Verify: `pnpm --filter=example-three-slug-text typecheck`, `pnpm --filter=@three-flatland/slug test`. `pnpm dev` should expose the example at `/three/slug-text` with no 404 and no console errors.
- [ ] **Step 0z.1.7** — Commit: `refactor(example-slug-text): relocate vanilla→three, remove standalone MFE entries`

---

## Phase 0a — Tweakpane Migration (before any feature work)

The `feat-slug` branch predates the Web Awesome → Tweakpane migration on `main`. Both slug-text examples still import `@awesome.me/webawesome` — forbidden by `examples/react/CLAUDE.md` ("Do NOT use Web Awesome") and the root CLAUDE.md. The React example also has no `useStatsMonitor`, which every example is required to have.

**Reference patterns (verified against `main`):**
- React canonical: `examples/react/pass-effects/App.tsx` — `usePane`/`useStatsMonitor`/`usePaneFolder`/`usePaneInput`/`usePaneButton` from `@three-flatland/tweakpane/react`, `<StatsTracker>` child component inside Canvas calling `useStatsMonitor(stats)`.
- Three canonical: `examples/three/pass-effects/main.ts` — `createPane({ scene })` from `@three-flatland/tweakpane`, `pane.addFolder` / `addBinding` with `{ min, max, step }`, `stats.begin()` / `stats.end()` wrapping the render loop, monitor bindings with `readonly: true` for diagnostics, `pane.refresh()` on a throttled timer.

**Non-negotiables per `examples/react/CLAUDE.md`:**
- No `@awesome.me/webawesome` imports (runtime or CSS).
- `usePane()` + `useStatsMonitor(stats)` in every example; `trackTimestamp: true` on `renderer` so GPU-timestamp mode works.
- Orthographic camera, `<color attach="background" args={['#00021c']} />`.
- Mutate refs inside `useFrame`, never `setState`.

### Task 0a.1 — React slug-text migration

**Files:**
- Modify: `examples/react/slug-text/App.tsx`
- Modify: `examples/react/slug-text/package.json` — drop `@awesome.me/webawesome` dep; pnpm-workspace catalog already has `@three-flatland/tweakpane`.
- Run: `pnpm sync:pack` after editing package.json.

- [ ] **Step 0a.1.1** — Remove all Web Awesome imports (`@awesome.me/webawesome` CSS + JS + React components). Delete `useWrappingGroup`. Delete the inline-styled status and UI panel `<div>`s.
- [ ] **Step 0a.1.2** — Add tweakpane imports:
  ```tsx
  import { usePane, usePaneFolder, usePaneInput, usePaneList, useStatsMonitor } from '@three-flatland/tweakpane/react'
  import type { StatsHandle } from '@three-flatland/tweakpane/react'
  ```
- [ ] **Step 0a.1.3** — Restructure `App` to match `pass-effects/App.tsx`:
  - `const { pane, stats } = usePane()` at App top-level.
  - Build UI folders/bindings **synchronously** on first render using the `initRef` pattern from `pass-effects/App.tsx:286-300`:
    - Settings folder: `Size` (list: 6/8/10/12/16/24/32/48/72/96/200), `Darken` (number, 0–1 step 0.01), `Thicken` (number, 0–3 step 0.01), `Max Width %` (number, 0.1–1.0 step 0.05 → drives `maxWidth`).
    - Diagnostics folder: `Force Runtime` (boolean, reloads font on change), `HTML Overlay` (boolean), readonly monitors: `Glyphs` (number, font.glyphs.size), `Load (ms)`, `Source` (string: "baked" | "runtime"), `Live Count` (number, slugText.count updated via `pane.refresh()` at 2Hz).
  - Hoist settings state into React refs, not state, where they don't drive conditional rendering (fontSize, stemDarken, thicken drive only the mesh — use refs + forward them into the scene via `useFrame` mutating mesh props).
- [ ] **Step 0a.1.4** — Add `<StatsTracker>` component inside `<Canvas>` calling `useStatsMonitor(stats)`. Pattern from `pass-effects/App.tsx:273-277`.
- [ ] **Step 0a.1.5** — Add `trackTimestamp: true` to `<Canvas renderer={...}>` so the GPU-time mode works.
- [ ] **Step 0a.1.6** — Keep hotkeys (`h` overlay, `r` runtime) but wire them through the pane bindings (mutate the bound object + `pane.refresh()`) rather than independent state, so UI + hotkey stay in sync.
- [ ] **Step 0a.1.7** — `HtmlOverlay` component stays (it's the comparison artifact, not a control). Inline style is fine there.
- [ ] **Step 0a.1.8** — Remove `@awesome.me/webawesome` from `package.json`, run `pnpm sync:pack`, run `pnpm --filter=example-react-slug-text typecheck`. Verify `pnpm --filter=example-react-slug-text dev` renders correctly.
- [ ] **Step 0a.1.9** — Commit: `refactor(example-slug-text): migrate React example to tweakpane, add stats monitor`

### Task 0a.2 — Three.js slug-text migration

**Files:**
- Modify: `examples/three/slug-text/main.ts`
- Modify: `examples/three/slug-text/index.html` — delete all Web Awesome UI markup (`<wa-radio-group>`, `<wa-slider>`, compare-mode buttons, words/darken/thicken sliders, runtime checkbox). Keep `<canvas id="compare-canvas">`, `<div id="split-handle">`, labels, `<div id="status">`, `<div id="computing">`.
- Modify: `examples/three/slug-text/package.json` — drop `@awesome.me/webawesome`, add `@three-flatland/tweakpane` via catalog.

- [ ] **Step 0a.2.1** — Strip all `@awesome.me/webawesome` imports from `main.ts`. Delete `setupWrappingGroup`.
- [ ] **Step 0a.2.2** — Add `import { createPane } from '@three-flatland/tweakpane'`. After scene + renderer init:
  ```ts
  const { pane, stats } = createPane({ scene })
  const settings = pane.addFolder({ title: 'Settings' })
  settings.addBinding(params, 'fontSize', { options: {...} })
  settings.addBinding(params, 'wordCount', { min: 1, max: 200, step: 1 })
  settings.addBinding(params, 'darken', { min: 0, max: 2, step: 0.01 })
  settings.addBinding(params, 'thicken', { min: 0, max: 2, step: 0.01 })
  const diag = pane.addFolder({ title: 'Diagnostics' })
  diag.addBinding(params, 'compareMode', { options: { Onion: 'onion', Diff: 'diff', Split: 'split' } })
  diag.addBinding(params, 'forceRuntime', { label: 'Force Runtime' })
  diag.addBinding(monitors, 'source', { readonly: true })
  diag.addBinding(monitors, 'loadMs', { readonly: true, format: v => `${v.toFixed(0)} ms` })
  diag.addBinding(monitors, 'glyphCount', { readonly: true })
  ```
- [ ] **Step 0a.2.3** — Wire `.on('change', …)` per binding to the existing mutations (`slugText.fontSize = ...`, `slugText.text = ...`, `loadFont()`, `updateSplitUI()`).
- [ ] **Step 0a.2.4** — Wrap `animate()` loop body with `stats.begin()` / `stats.end()` per `pass-effects/main.ts:469-502`.
- [ ] **Step 0a.2.5** — `pnpm sync:pack`, `pnpm --filter=example-three-slug-text typecheck`, verify dev server renders.
- [ ] **Step 0a.2.6** — Commit: `refactor(example-slug-text): migrate Three example to tweakpane`

---

## Phase 0: Rebase Ship-Check (already done in this session)

- [x] Rebase `feat-slug` onto `main` (resolved `package.json`, `pnpm-lock.yaml`, `docs/astro.config.mjs`). Branch is 14 commits ahead of `main`.

**Files:**
- Modify: `package.json` (merged `@three-flatland/slug` into overrides alongside new `skia`/`skills`/`tweakpane` entries from main)
- Modify: `docs/astro.config.mjs` (added Slug Text guide + example entries next to Skia)
- Regenerated: `pnpm-lock.yaml`

- [ ] **Step 0.1: Verify the rebase builds & tests pass before adding features.**

```bash
pnpm install
pnpm -w run typecheck
pnpm -w run test
pnpm --filter @three-flatland/slug test
```

Expected: all green. If typecheck fails in an unrelated package (skia/skills/tweakpane ↔ slug interaction), fix in a follow-up commit on the branch before proceeding.

- [ ] **Step 0.2: Force-push rebased branch.**

```bash
git push --force-with-lease origin feat-slug
```

---

## Phase 1 — Font Metrics & Measurement API (smallest, highest value)

**Single public entry point:** `font.measureText(text, fontSize, opts?)`. Internally dispatches to whichever backend the font was loaded with — exactly like the existing `shapeText` pattern (`SlugFont.ts:104`). opentype.js is **never** imported at module load; it arrives only because `SlugFontLoader` already dynamic-imports `./pipeline/textShaper.js` on the runtime path, which in turn imports opentype types-only (`import type { Font }` is erased). The baked path never references opentype, and tree-shaking / per-file ES imports keep the baked-only bundle opentype-free.

Mirror the existing split **exactly**: two peer files under `pipeline/`, loaded the same way as `textShaper.ts` / `textShaperBaked.ts`.

**Files:**
- Create: `packages/slug/src/pipeline/textMeasure.ts` — opentype-backed measurement (runtime path only)
- Create: `packages/slug/src/pipeline/textMeasureBaked.ts` — baked-data measurement (zero opentype)
- Create: `packages/slug/src/pipeline/textMeasure.test.ts`
- Create: `packages/slug/src/pipeline/textMeasureBaked.test.ts`
- Modify: `packages/slug/src/SlugFont.ts` — one new method `measureText`, mirroring `shapeText` dispatch; add private `_measureTextOT` / `_measureTextBaked` refs alongside `_shapeTextOT`/`_shapeTextBaked`
- Modify: `packages/slug/src/SlugFontLoader.ts` — dynamic-import the matching measure module in each load path and store the ref via the existing `_createRuntime` / `_createBaked` factories (extend their signatures)
- Modify: `packages/slug/src/types.ts` — export `TextMetrics`, `LineMetrics`, `MeasureOptions`
- Modify: `packages/slug/src/index.ts` — re-export the types (types only, no runtime)

### Task 1: Shared metric types

Spiritually aligned with `CanvasRenderingContext2D.measureText` — **single-line, no wrap**. Multi-line/paragraph measurement lives with rich text in Phase 6 where layout actually matters.

- [ ] **Step 1.1: Add types to `packages/slug/src/types.ts`.**

```ts
/**
 * Text metrics for a single, unwrapped line. Shape mirrors the subset of the
 * browser's CanvasRenderingContext2D TextMetrics that we can cheaply compute
 * from font outlines + glyph bounds.
 */
export interface TextMetrics {
  /** Horizontal advance of the shaped line, in object-space units (pixels when fontSize is in px). */
  width: number
  /** Tight inked bounds of the shaped glyphs. `Left`/`Right` measured from the starting pen position. */
  actualBoundingBoxLeft: number
  actualBoundingBoxRight: number
  actualBoundingBoxAscent: number
  actualBoundingBoxDescent: number
  /** Font-level ascent/descent for the fontSize, independent of the actual glyphs. */
  fontBoundingBoxAscent: number
  fontBoundingBoxDescent: number
}
```

No `MeasureOptions` — `measureText` takes `(text, fontSize)` only. No `lineHeight`, no `maxWidth`, no `lines[]`.

- [ ] **Step 1.2: Re-export in `index.ts`.**

```ts
export type { TextMetrics } from './types.js'
```

- [ ] **Step 1.3: Commit.** `chore(slug): add measurement types`

### Task 2: Baked measurement (no opentype)

- [ ] **Step 2.1: Write failing test `pipeline/textMeasureBaked.test.ts`.** Load the baked `.slug.json` + `.slug.bin` shipped with the Three example, assert `measureTextBaked(baked, glyphs, unitsPerEm, ascender, descender, 'Hello', 48)` returns positive `width`, `actualBoundingBoxAscent ≤ fontBoundingBoxAscent`, and `fontBoundingBoxAscent + fontBoundingBoxDescent ≈ 48 * (ascender - descender) / unitsPerEm`. Assert no `opentype.js` in `require.cache` / import graph.

- [ ] **Step 2.2: Implement `textMeasureBaked.ts`.** Signature parallels `textShaperBaked.ts`:

```ts
import type { BakedFontData } from '../baked.js'
import type { SlugGlyphData, TextMetrics } from '../types.js'

export function measureTextBaked(
  baked: BakedFontData,
  glyphs: Map<number, SlugGlyphData>,
  unitsPerEm: number,
  ascender: number,
  descender: number,
  text: string,
  fontSize: number,
): TextMetrics {
  // Sum advances + kerning across codepoints (no wrap, no newline handling — single line per browser semantics).
  // Track tight bounds: for each glyph, expand actualBoundingBox by (cursorX + glyph.bounds * scale).
  // fontBoundingBoxAscent/Descent come from the font header.
}
```

No `opentype.js` import.

- [ ] **Step 2.3: Run test, green, commit.** `feat(slug): baked-data text measurement`

### Task 3: Runtime (opentype) measurement

- [ ] **Step 3.1: Write failing test `pipeline/textMeasure.test.ts`** using a freshly-loaded `.ttf` via `SlugFontLoader.load` against the runtime path. Same assertions as Task 2.

- [ ] **Step 3.2: Implement `textMeasure.ts`.** Mirrors `textShaper.ts` (same opentype API surface — `stringToGlyphs`, `getKerningValue`, `glyph.advanceWidth`) but returns `TextMetrics`. `import type { Font } from 'opentype.js'` only (erased at runtime).

- [ ] **Step 3.3: Run test, green, commit.** `feat(slug): runtime text measurement via opentype`

### Task 4: Loader wiring + single public API

- [ ] **Step 4.1: Extend `_createBaked` / `_createRuntime` in `SlugFont.ts`** to also accept the matching measure function, stored on `_measureTextBaked` / `_measureTextOT` fields alongside the existing shape refs.

- [ ] **Step 4.2: Add `measureText` dispatcher to `SlugFont`**, exactly parallel to `shapeText`:

```ts
measureText(text: string, fontSize: number): TextMetrics {
  if (this._bakedData && this._measureTextBaked) {
    return this._measureTextBaked(
      this._bakedData, this.glyphs, this.unitsPerEm,
      this.ascender, this.descender, text, fontSize,
    )
  }
  if (this._opentypeFont && this._measureTextOT) {
    return this._measureTextOT(this._opentypeFont, text, fontSize)
  }
  throw new Error('SlugFont: text measurement not available — load via SlugFontLoader')
}
```

This is the **only** new public method. Spiritually equivalent to `CanvasRenderingContext2D.measureText`: single line, single call, returns the same-named fields. No `measureSpan`, no `getMetrics`, no wrap option — **YAGNI**. Multi-line/paragraph layout is Phase 6's job.

- [ ] **Step 4.3: Update `SlugFontLoader.ts`.** Add a matching dynamic import next to the existing shaper import:

```ts
// Baked path
const [{ shapeTextBaked }, { measureTextBaked }] = await Promise.all([
  import('./pipeline/textShaperBaked.js'),
  import('./pipeline/textMeasureBaked.js'),
])
return SlugFont._createBaked(glyphs, textures, metrics, bakedData, shapeTextBaked, measureTextBaked)

// Runtime path — mirror with textShaper + textMeasure
```

- [ ] **Step 4.4: Write integration test** asserting `(await SlugFontLoader.load('.../Inter-Regular.slug.json')).measureText('Hi', 24)` works and that the loader did not import `opentype.js` (snapshot `Object.keys(require.cache)` or spy the dynamic import).

- [ ] **Step 4.5: Run all slug tests, commit.** `feat(slug): expose SlugFont.measureText (opentype loaded lazily, skipped for baked fonts)`

### Task 5: Example control (ship gate) + docs

- [ ] **Step 5.1:** In `examples/{three,react}/slug-text/`, add a "Measure" folder to the Tweakpane panel with:
  - Toggle `Show Bounds` — when on, overlays a visible rectangle matching `font.measureText(text, fontSize)` at the text's anchor position. Uses `actualBoundingBoxAscent/Descent` for vertical extent and `width` for horizontal.
  - Toggle `Show Font Bounds` — overlays a second rectangle using `fontBoundingBoxAscent/Descent` (font-level, glyph-independent).
  - Readonly monitor `Width (px)` — live `font.measureText(text, fontSize).width`.
  - Readonly monitor `Ink (px)` — `actualBoundingBoxRight − actualBoundingBoxLeft`.
  
  Overlay is drawn in the R3F scene (a `<mesh>` with `LineSegments` or a thin wireframe box) so it moves with the text and respects camera. Vanilla mirrors with a Three `LineSegments`. Must visibly track every change to `text`, `fontSize`, or selected font.
- [ ] **Step 5.2:** Add a "Measuring text" section to `packages/slug/README.md` and `docs/src/content/docs/guides/slug-text.mdx` — one example showing `font.measureText(...)` returning `TextMetrics`, mirroring the example control's behavior.
- [ ] **Step 5.3: Interactive verification** — run `pnpm --filter=examples dev`, open `/three/slug-text` and `/react/slug-text`, toggle `Show Bounds` on, verify the overlay rect exactly matches the rendered text extent at multiple font sizes and text strings.
- [ ] **Step 5.4: Commit.** `feat(example-slug-text): interactive measureText visualization`

### Task 2: Docs

- [ ] **Step 2.1: Add a "Measuring text" section to `packages/slug/README.md` and `docs/src/content/docs/guides/slug-text.mdx` showing a `<div>`-free overlay positioning example.**
- [ ] **Step 2.2: Commit: `docs(slug): document measurement API`.**

---

## Phase 2 — Font Styles (underline / strikethrough / super / sub)

Pure-CPU/geometry feature: layout emits extra rectangle primitives and adjusts positioned-glyph scale/offset. No shader changes.

**Files:**
- Create: `packages/slug/src/pipeline/decorations.ts`
- Modify: `packages/slug/src/pipeline/textShaper.ts` — accept `StyleSpan[]`, emit decoration rects
- Modify: `packages/slug/src/pipeline/textShaperBaked.ts` — same
- Modify: `packages/slug/src/types.ts` — add `StyleFlags`, `StyleSpan`, `DecorationRect`
- Modify: `packages/slug/src/SlugGeometry.ts` — accept decoration rect list, emit them as degenerate-quad instances with flag `GLYPH_IS_RECT`
- Modify: `packages/slug/src/SlugMaterial.ts` — cheap branch: when instance flag is "rect", skip curve eval and output solid color
- Modify: `packages/slug/src/SlugText.ts` — accept `styles?: StyleSpan[]`

**Approach:** piggyback on the existing instance pipeline. A "rect" instance stores `glyphPos=(cx,cy,halfW,halfH)` like any glyph but encodes a sentinel (e.g. `glyphJac.w < 0` or a dedicated flag in `glyphColor.a`'s integer part) so the fragment shader short-circuits to `coverage = 1.0`. This avoids a second draw call.

### Task 3: Decoration geometry

- [ ] **Step 3.1: Test** — `decorations.test.ts` asserts that `decorateLine({ line, underline: true, fontSize: 48, metrics })` produces a rect at y = descender + 10% stroke, width = line width.
- [ ] **Step 3.2: Implement `decorations.ts`** (pure function over `LineMetrics`).
- [ ] **Step 3.3: Shader short-circuit** — in `SlugMaterial._buildShader`, read a `isRect` float from an unused lane of `glyphJac` (e.g. `glyphJac.w` sign bit). `select(isRect, float(1.0), slugRender(...))`.
- [ ] **Step 3.4: Commit.**

### Task 4: Super / Sub scripts

- [ ] **Step 4.1: Test** that a style span with `vertical: 'super'` positions glyphs at `y + ascent * 0.33` and scales by `0.6`.
- [ ] **Step 4.2: Implement** — pass `styleForIndex(i)` into the shaper's position accumulator, multiplying the `scale` field in `PositionedGlyph` and adding vertical offset.
- [ ] **Step 4.3: Commit.**

### Task 5: SlugText API + docs

- [ ] **Step 5.1: Add `styles` setter on `SlugText`** that marks dirty and forwards to shaper.
- [ ] **Step 5.2: Example update** — `examples/react/slug-text/App.tsx` adds a Tweakpane toggle list.
- [ ] **Step 5.3: Docs + commit.**

---

## Phase 3 — Glyph Fallback Chain (`SlugFontStack`)

Scope: "render this string with font A; for any codepoint A lacks, try B, then C; if none have it, draw notdef". **Per-codepoint**, **automatic**, **author never tags runs**. All fonts are user-loaded (`SlugFontLoader.load(...)`) and resident on the GPU — there is no system-font access in the browser, and Slug itself doesn't do system-font access either (the manual's fallback chain assumes you've loaded every font you want in the chain; §4.6, p.40-43).

Explicitly **out of scope for this phase**:
- *Rich-text run selection* — the "this span uses font A, this span uses font B" feature where the author tags spans. That's Phase 6 (rich text). Rich-text runs can each *carry* a `SlugFontStack`, but choosing between runs is an author decision, not a per-codepoint fallback decision.
- *Color emoji* (COLR/CPAL/CBDT bitmap tables). Emoji falls back to the emoji font's outline if present, else notdef. Tracked as a future roadmap item.
- *System fonts*. Not a thing — all fonts must be explicitly loaded.

**Files:**
- Create: `packages/slug/src/SlugFontStack.ts` + test
- Create: `packages/slug/src/pipeline/shaperStack.ts` + test
- Modify: `packages/slug/src/SlugText.ts` — accept `font: SlugFont | SlugFontStack`
- Modify: `packages/slug/src/index.ts`

**Approach:** `SlugFontStack(fonts: SlugFont[])` runs per-codepoint fallback — for each char, pick the first `SlugFont` whose baked/runtime cmap yields a non-zero glyphId (not notdef). Shaping returns `{ font, positioned }` tuples grouped by backing font. `SlugText` creates one child `InstancedMesh` (with that font's material/textures) per group, parented to itself. Kerning is only applied within same-font runs (acceptable; matches browser behavior). Advance continuity is maintained by the stack shaper using each font's per-glyph advance. This is the simplest path that sidesteps mixing two different `curveTexture`/`bandTexture` pairs in one draw call.

### Task 6: Codepoint → font resolution

- [ ] **Step 6.1: Test** — `new SlugFontStack([inter, notoEmoji]).resolveCodepoint(0x1F600)` returns `notoEmoji`; ASCII returns `inter`.
- [ ] **Step 6.2: Implement** — for baked fonts, search `baked.cmap` (sorted); for runtime, `font._opentypeFont.charToGlyph(ch).index !== 0`. Cache last-hit font index.
- [ ] **Step 6.3: Commit.**

### Task 7: Stack shaper

- [ ] **Step 7.1: Test** — shaping `'Hi 😀'` returns two runs: `(inter, [H,i, ])` + `(notoEmoji, [😀])` with the emoji's `x` equal to the cumulative advance of "Hi ".
- [ ] **Step 7.2: Implement `shaperStack.ts`** using `measureSpan` per codepoint to advance the cursor between font switches.
- [ ] **Step 7.3: Commit.**

### Task 8: SlugText multi-material

- [ ] **Step 8.1: Replace single `InstancedMesh` body** with a container: `SlugText` becomes a thin wrapper whose `_rebuild()` removes existing child meshes and creates one per run. `count`/`instanceMatrix` live on the children.
- [ ] **Step 8.2: Port existing tests** to hit both paths (single-font still works unchanged — `SlugFont` input wraps itself in a 1-font stack internally).
- [ ] **Step 8.3: Example** — `examples/react/slug-text/App.tsx` loads Inter + an emoji font (e.g. `NotoColorEmoji-Regular.ttf`) and renders `'Flatland 🔺'`.
- [ ] **Step 8.4: Docs + commit.**

> **Scope cutoff:** color emoji (COLR/CPAL/CBDT) rendering is *out of scope*. Emoji glyphs are rendered as their outline if present, or as notdef otherwise. Add a roadmap entry.

---

## Phase 4 — Analytic Stroked Text (crisp by default, bevel-via-min)

**Re-scoped (2026-04-14):** the explicit miter-join geometry, round-join geometry, cap styles, and dash infrastructure moved to Phase 5 where open paths actually need them. Phase 4 ships the smaller, load-bearing slice — distance-to-curve, runtime-uniform width, bevel-via-min at corners, crispness gate — so Phase 5 has a stable stroke pipeline to extend.

**Non-negotiable:** text outlines must preserve crisp letterform corners — sharp interior angles, no halo, no pixel hairlines that disappear — at any stroke width. This phase ships only when the crispness-verification suite (Task 14) passes on a serif + a sans-serif sample.

**Approach: analytic distance-to-curve, runtime-uniform width, bevel-via-min at exterior joins.** Not SDF. Diverges from Slug's reference which bakes outlines at font-conversion time with a single width — we trade shader complexity for runtime-uniform width + skipping the contour-offset CPU algorithm. Diverges from Slug's reference for joins too: Slug explicitly clips join geometry to miter/bevel/round triangles; we take `min(distance)` across all the glyph's curves and let the distance field naturally produce a bevel at exterior corners (the two curves' capsules meet flat along the bisector). This is Phase 4's simplification — it's visually indistinguishable from explicit bevel at sharp corners, and interior corners remain naturally crisp (same as fill).

**Text is closed-contour-only — no caps ever, no explicit join variants.** Phase 5 adds the miter-extension geometry, round-join arcs, explicit miter-limit fallback, cap styles, and dashing.

### Crispness matrix (this phase must deliver all green for text)

| | Phase 4 deliverable |
|---|---|
| Body text outlines (≤0.05 em) | ✅ Indistinguishable from baked-reference crisp |
| Display text outlines (0.05–0.15 em) | ✅ Sharp tips on A/V/W via bevel-via-min, crisp serif ends |
| Curved letters (O, S, C) | ✅ Smooth always |
| Interior angles (inside of H crossbar, etc.) | ✅ Crisp — distance field handles natively |
| Sub-pixel hairlines | ✅ Crispness gate widens coverage so 0.5px strokes don't disappear |

Explicit miter joins, round joins, caps, dashing — all in **Phase 5**.

### Internal milestone: no-join POC (Task 10, not shipped)

Before `SlugText.outline` is public, a bare distance-to-curve shader gets built and tested against the CPU reference. No join classification — just `min(distance)` across all band curves. This validates the analytic path. `SlugText.outline` is not wired up until Task 13.

### Stroke width bounds

- **Lower (crispness gate):** ~1 pixel. Below `fwidth(renderCoord)` the naive smoothstep range covers the whole stroke and coverage fades away. The gate widens the coverage window so a 0.5px-wide line still registers as a 1px-visible outline — trade: a touch of bloom in exchange for not vanishing. Matches Slug's thickening strategy for small fills.
- **Upper (band halo):** when `strokeHalfWidth` exceeds the band cell size (~6–12% em for text), fragments at the outer edge of the stroke need curves from neighbouring bands. Typical text outlines are 3–10% em — safely below. For thick strokes, the band probe reads bands in `[y − halfWidth, y + halfWidth]` and unions curve lists. Linear cost in `halfWidth / cellSize`.
- **Quad dilation:** the instance quad must be grown by `+strokeHalfWidth` in object space so fragments outside the fill bbox still get shaded. Extends the existing `slugDilate` pixel-dilation — add a `strokeHalfWidth` uniform.

### Algorithm (Phase 4 final)

```
minDist = ∞
for each curve in h-band ∪ v-band at renderCoord (halo-probed, deduped):
  (d, t) = distanceToQuadBezier(renderCoord, curve)
  minDist = min(minDist, d)
aa = 0.5 · fwidth(renderCoord)
coverage = smoothstep(halfWidth + aa, halfWidth − aa, minDist)
```

Corner behavior falls out of `min(d)` — at a contour vertex where curve A ends and curve B starts, the fragment on the outside sees both capsules and picks the smaller; the boundary is the bisector, producing a clean bevel. Interior corners are naturally crisp because the distance field takes min over both curves' negative-side capsules.

**What Phase 5 must change here** (flagged for the plan doc, not this phase's code): replace the naked `min(d)` at exterior joins with an endpoint-aware classifier that checks `t ≤ 0` / `t ≥ 1` plus `prevTangent/nextTangent`, and dispatches on `joinStyle`. Phase 4 leaves the classifier stubbed (no-op) so Phase 5's extension is strictly additive.

### Data model (Phase 4: curves only, no tangents yet)

Per-curve storage stays at 2 texels (p0, p1, p2 with endpoint sharing). **Neighbor tangents are Phase 5's problem** — Phase 4's bevel-via-min algorithm doesn't need them. Moving the curve-texture layout change to Phase 5 keeps Phase 4 from requiring a baked-format bump, a re-bake of all fixtures, and a migration story. Trade-off: Phase 5 will do the format bump when it needs it.

### `distanceToQuadBezier` implementation

Closest point on a quadratic Bezier = cubic root-find (`∂|B(t)−p|²/∂t = 0`). Two paths:
- **Closed-form Cardano** — ~3× the work of `solveQuadratic`, no iteration, handles all cases deterministically.
- **Newton refinement** from `solveQuadratic`'s derivative roots as initial guesses, 3–4 iterations — cheaper, well-initialized, converges reliably.

POC uses Newton. Benchmark both in Task 10.3; pick winner.

**Files (Phase 4):**
- Create: `packages/slug/src/shaders/distanceToQuadBezier.ts` — TSL `Fn` + pure-JS twin. Returns `(distance, t)`.
- Create: `packages/slug/src/shaders/distanceToQuadBezier.test.ts`.
- Create: `packages/slug/src/shaders/slugStroke.ts` — TSL `Fn` reading `(curveTexture, bandTexture, coord, glyphLocX, glyphLocY, numHBands, numVBands, glyphBand, strokeHalfWidth)`. Halo-aware band iteration, `min(distance)` across curves, crispness-gated smoothstep. Leaves a labeled extension point (`// Phase 5: join classifier dispatches here`) where miter/round/bevel/cap logic hooks in.
- Create: `packages/slug/src/shaders/slugStroke.test.ts` — CPU reference `strokeCoverage(glyph, coord, halfWidth)` + GPU-vs-CPU parity over a 32×32 fragment grid per glyph.
- Create: `packages/slug/src/SlugStrokeMaterial.ts` — uniforms: color, opacity, viewport, mvp rows, `strokeHalfWidth`. Reserves uniform slots for `joinStyle`, `miterLimit`, `capStyle` (Phase 5) but wires them as unused no-ops in the shader for now.
- Modify: `packages/slug/src/shaders/slugDilate.ts` — accept `strokeHalfWidthEm` uniform; dilate quad by `pixelHalfWidth + strokeHalfWidthEm / invScale`.
- Modify: `packages/slug/src/SlugText.ts` — accept `outline?: { width?: number; color?: number | Color }`. Default `width = 0.05`. Runtime mutation updates uniforms in place, no rebuild.
- Modify: `packages/slug/src/index.ts` — export `SlugStrokeMaterial`.

### Task 9: CPU distance-to-curve reference

- [ ] **Step 9.1: Test** — straight degenerate quad (0,0)→(10,0): distance from (5,3) = 3, t = 0.5. Symmetric quarter-arc (0,10)→(10,0) with control (0,0): distance from (0,0) = `10·(1 − √2/2)` analytical. Distance monotonically decreases then increases sweeping t across the closest point.
- [ ] **Step 9.2: Implement** pure-JS `distanceToQuadBezier(p, p0, p1, p2): { distance, t }`. Start from `solveQuadratic`'s derivative roots, clamp to [0, 1], plus endpoints. Pick min, 3 Newton iterations. Return min over all candidates.
- [ ] **Step 9.3: Commit.** `feat(slug): analytic distance-to-curve primitive`

### Task 10: Stroke shader (bevel-via-min, no explicit joins)

- [ ] **Step 10.1: TSL port** of `distanceToQuadBezier` in `shaders/distanceToQuadBezier.ts`.
- [ ] **Step 10.2: Test** — for "I", halfWidth=0.05 em: stem-centerline fragments → coverage=1 at |dx|≤0.04, 0 at |dx|≥0.06. Outside-the-fill-near-outline → coverage=1. Inside-the-fill-far-from-any-curve → coverage=0. Validate corner behavior on "A": exterior top-tip fragment on the bisector gets clean bevel (no spike, no gap).
- [ ] **Step 10.3: `slugStroke.ts`** — halo-aware band iteration, `distanceToQuadBezier` per curve, crispness-gated smoothstep. GPU-vs-CPU parity over 32×32 grid for 5 test glyphs (I, O, A, S, dot-i). Bench Newton vs Cardano; pick winner; comment the loser. Leave a documented extension point where Phase 5's join classifier hooks in.
- [ ] **Step 10.4: Commit.** `feat(slug): analytic stroke shader (bevel-via-min)`

### Task 11: SlugStrokeMaterial + dilation

- [ ] **Step 11.1: `SlugStrokeMaterial`** — uniforms (color, opacity, viewport, mvp rows, `strokeHalfWidth`), setter methods (`setStrokeHalfWidth`, `setStrokeColor`). Reserve unused uniform slots `joinStyle`, `miterLimit`, `capStyle` pre-declared but fed into no-op shader paths — keeps Phase 5's material-API extension strictly additive.
- [ ] **Step 11.2: Quad dilation** — `slugDilate.ts` accepts `strokeHalfWidthEm`. Test: halfWidth=0.1 em produces quad covering bbox + 0.1em margin.
- [ ] **Step 11.3: Commit.** `feat(slug): SlugStrokeMaterial + stroke-aware dilation`

### Task 12: SlugText integration

- [ ] **Step 12.1: `SlugText.outline`** — optional outline config creates a child `InstancedMesh` behind fill, sharing `SlugGeometry`. Uniform changes mutate in place.
- [ ] **Step 12.2: Runtime-smooth-width integration test** — render "Hi" at width=0.05, snapshot; change width to 0.10 next frame without calling `_rebuild()`, snapshot, assert diff is strictly the outer ring expansion. No rebuild, no flicker.
- [ ] **Step 12.3: Commit.** `feat(slug): SlugText.outline with runtime-uniform width`

### Task 13: Crispness verification suite (shipping gate)

This task is the gate. Phase 4 does not ship until all rows of the crispness matrix are verified green against reference images.

- [ ] **Step 13.1: Fixtures** — bake `Inter-Regular` (sans, has A/V/W sharp tips) and `NotoSerif-Regular` (serif, has many sharp corners). Store under `packages/slug/test/fixtures/`.
- [ ] **Step 13.2: Reference images** — render the strings "AVWM", "Hxyz", "O", "TYPE" at fontSize ∈ {24, 96}, halfWidth ∈ {0.02, 0.05, 0.10, 0.15}. Generate via Canvas2D + `CanvasRenderingContext2D.strokeText` (note: this renders explicit miters by default — expect divergence at sharp tips, assert "visually similar" rather than pixel-exact; the miter vs bevel-via-min distinction is what Phase 5 closes).
- [ ] **Step 13.3: Automated comparison** — headless WebGPU render with `SlugText.outline`. Mean delta < 1% across the body of the stroke; exterior-tip regions have a relaxed tolerance (Phase 4's bevel vs Canvas2D's miter is an expected diff). Hard assertions: no pixel coverage gap at interior corners, no fade-out at 0.5px widths (crispness gate).
- [ ] **Step 13.4: Visual smoke** — Playwright snapshot `/three/slug-text` with outline on, width=0.10. Diff against a checked-in expected image. Catches full-pipeline regressions.
- [ ] **Step 13.5: Fix failures** (may loop into Task 10 if the halo probe misses curves). Do not proceed until green.
- [ ] **Step 13.6: Commit.** `test(slug): crispness gate for analytic stroked text`

### Task 14: Example + docs

- [ ] **Step 14.1: Example** — `examples/{three,react}/slug-text/` add outline panel: width slider (runtime uniform 0–0.15 em), color picker. Style radio: `[Fill | Outline | Both]`. Scrubbing width updates live with zero rebuild.
- [ ] **Step 14.2: Docs** — guide page demonstrating outlined text with a note that joins are **bevel** at this stage, with miter/round joins arriving in Phase 5 alongside caps and dashing for vector graphics.
- [ ] **Step 14.3: Commit.** `feat(slug): outlined-text example with runtime width + color controls`

---

## Phase 5 — Generic Vector Graphics (bake strokes as fills, Slug manual ch.3)

**Re-scoped (2026-04-14, round 2):** Phase 4 shipped a dynamic analytic-distance stroke shader — useful for dev iteration, **not the ship path.** Benching against M2 text budgets and re-reading the Slug manual made the runtime numbers clear: Slug's reference doesn't run a distance-to-curve shader in production. It **bakes strokes as offset contours that render through the fill shader** (manual §4430, §4714). That's the path Phase 5 commits to.

**Why this is the right call:**
- Per-fragment cost of baked-as-fill = 1× fill (what text already pays). Dynamic `slugStroke` = ~2.6× fill. On M2 text already eats 3–4 ms/frame; games can't afford another 2× on top.
- What users actually animate in strokes (audited on real product use cases): dash offset (marching ants), color, opacity, transform, pre-baked width swap. None of those need the dynamic shader — they're all bake-compatible.
- Continuous width scrubbing is the only dynamic-exclusive knob. Covered by a runtime fallback (JS offsetter + texture-pool upload) that warms into the fast path after one frame.

**Architecture:**
1. **`slug-bake` CLI grows a quadratic-Bezier contour offsetter.** CPU, build-time. Emits offset contours for a user-configured set of stroke widths × join × cap variants. Store as additional closed contours in the baked file, packed into the same curve/band textures the fill shader already reads.
2. **Offset contours reference the glyph's curves by offset metadata, not copy.** Per-glyph "stroke set" = (width, joinStyle, capStyle) → (extra curve table, extra band table). Switching width = swap the stroke-set reference via instance-attribute or uniform. Glyph curve data itself is untouched. Never re-process glyph geometry when the stroke width changes.
3. **Same fill shader (`slugRender`) renders stroked text and stroked shapes.** Zero new fragment path. No miter/cap/distance math at runtime. Join and cap geometry are decided at bake time.
4. **Dashing** becomes a fill-shader modifier: per-curve arc-length section + a single-float `dashOffset` uniform + dash-array texture. Fragments in gap regions reject. Same shader, one cheap modulo + array lookup.
5. **Runtime fallback for unbaked widths:** async-worker curve offsetter uploads new stroke contours into the texture pool on demand. First frame at a new width = degraded (fall back to unstroked fill, or synchronous dynamic for that frame only). Steady state = cache warm, 1× fill cost forever.
6. **Dynamic stroke shader (`slugStroke`) stays as `outline: { mode: 'dynamic' }` opt-in** — no miter/cap/dash work goes into it. Bevel-via-min forever. Documented as a dev/tinker mode with honest cost. Phase 4's shipping implementation stays intact.

**Why keep the dynamic path at all:**
- Dev/demo tool — scrubbing width live to see what a design looks like is valuable during iteration.
- Runtime fallback if async offsetter hasn't finished (one frame of bevel-via-min beats a missing stroke).
- No ongoing cost — the shader is already written and the uniform slots reserved.

### What can we animate at shipping runtime cost?

Audit driving the re-scope. ✅ = ship-path (via baked-as-fill). `dyn` = dynamic-only.

| Property | Text | Shapes | Path |
|---|---|---|---|
| Fill color | ✅ | ✅ | uniform |
| Opacity | ✅ | ✅ | uniform |
| Transform (pos/rot/scale) | ✅ | ✅ | MVP |
| Stem-darken / thicken | ✅ | ✅ | uniform |
| Stroke color | ✅ | ✅ | uniform |
| **Stroke width — swap among pre-baked set** | ✅ | ✅ | instance attr / uniform |
| **Dash offset (marching ants)** | ✅ | ✅ | uniform |
| Dash array structure | — | ✅ | dash-array texture rebind |
| Stroke width — continuous scrub | dyn | dyn | slugStroke (dev) / async offsetter (prod) |
| Join style (miter/round/bevel) | dyn | dyn | rebake, or dynamic-mode runtime |
| Cap style (flat/square/round/triangle) | — | dyn | rebake, or dynamic-mode runtime |
| Miter limit | dyn | dyn | rebake, or dynamic-mode runtime |

Conclusion: the full realtime-animatable set ships through the fill pipeline at fill cost. The dynamic path serves exactly the scrub-and-iterate dev workflow.

### Scope delta vs the previous Phase-5 sketch

**Deleted:**
- Full miter/round/bevel extension of `slugStroke.ts` with in-shader classifier dispatch (Task 18)
- Cap-style shader logic (Task 19)
- In-shader distance-based dashing via arc-length tables (Task 20)
- 3-texel curve layout with neighbor tangents (redundant — bake-time offsetter produces closed contours; neighbor tangents are a CPU concern, not GPU)
- `SlugStrokeMaterial` extension with join/cap/dash uniforms (same reason)

**Added:**
- CPU quadratic-Bezier contour offsetter (build-time, in `slug-bake`)
- Stroke-set data model in the baked format (per-width, per-(join,cap) variant)
- Stroke-set runtime swap API (`SlugText.outline.width` picks from pre-baked set, or triggers async offset)
- Runtime offset worker + texture-pool integration for unbaked widths
- Dash offset / dash-array uniform modifier on `SlugMaterial` (fill shader)

**Kept:**
- `SlugShapeBatch` — retained-mode batch allocator (unchanged)
- SVG path-d parser
- Texture pool for dynamic curve/band append
- Shared contour → GPU data pipeline refactor

### Curve offsetting (the core new piece)

Quadratic Bezier offsetting is *not* closed-form — the parallel curve of a quadratic is a higher-order curve. Production approach:

1. **Adaptive subdivision.** Split each quadratic at points of high curvature until each segment's offset can be approximated by a single quadratic within tolerance ε.
2. **Per-segment offset.** For each subdivided quadratic, construct the offset-segment control points using the normal at p0, p1, p2 at the offset distance `±halfWidth`.
3. **Join insertion at contour vertices.** At each inter-curve vertex, compute the outer-side bisector. Emit:
   - **Miter:** one sharp vertex extending to `miterLength = halfWidth / sin(angle/2)`. If `miterLength > miterLimit·halfWidth`, fall through to bevel.
   - **Bevel:** flat segment connecting the two outer offset endpoints.
   - **Round:** arc approximated by 2–4 quadratic Beziers covering the outer angle.
4. **Cap insertion at contour endpoints (open paths).** Flat = no extension. Square = a square extension of 2 short quads. Round = 2–4 quads forming a semicircle. Triangle = 2 quads forming an isoceles triangle.
5. **Close the offset.** Inner offset (on the fill side) + outer offset (on the stroke side) glue together at caps/joins to form one closed contour per original contour.

Tolerance `ε = 0.01·halfWidth` is a reasonable default — visually indistinguishable but keeps subdivision bounded. ε lower for extreme magnification cases. Cap this with a hard max subdivision depth (8 levels) so pathological inputs can't explode.

Output: a new set of closed contours (quadratic Beziers). Emit into the same pipeline the fill path uses — `buildContoursToGpuGlyph` packs them into curve + band textures, `slugRender` renders them through standard winding-number coverage.

### Baked format for stroke sets

Per-glyph (or per-shape), the baked file optionally holds a **stroke set** — one or more offset-contour bundles keyed by stroke parameters:

```
StrokeSet {
  width: float                      // em-space stroke width
  joinStyle: 'miter' | 'round' | 'bevel'
  capStyle: 'flat' | 'square' | 'round' | 'triangle'
  miterLimit: float                 // only meaningful when joinStyle === 'miter'
  curveTable: Uint16[]              // offset contour curves (same layout as glyph)
  bandTable: Float32[]              // bands for these curves
  arcLengthTable?: Uint16[]         // optional — present when dashing needed
  totalLength: float                // contour total arc-length (for dashOffset math)
}
```

A glyph/shape may carry multiple stroke sets — one per configured (width, join, cap) tuple. Runtime picks the closest match; exact match = fast path, no match = async offsetter fallback.

### Runtime API additions

```ts
// Per-instance on SlugShapeBatch + SlugText.outline config:
interface StrokeSpec {
  width: number                      // em-space
  color?: Color | number | string
  join?: 'miter' | 'round' | 'bevel' // bake-time choice, swapping needs rebake
  cap?: 'flat' | 'square' | 'round' | 'triangle'  // same
  miterLimit?: number                // same
  dashArray?: number[]               // runtime — uniform array, cheap
  dashOffset?: number                // runtime — single float uniform
}

// Material selection:
// - stroke set exists in baked data → uses SlugMaterial (fill shader)
// - stroke set doesn't match → async SlugBaker.buildOffset(width, join, cap)
//   uploads into texture pool, instance re-binds on completion
// - while pending → configurable fallback: draw nothing, or draw bevel-via-min
//   dynamic stroke for one frame
```

### Dash-offset as fill-shader modifier

Dashing on baked offset contours is a fragment-shader modulator, not a new coverage algorithm:

```
// In slugRender fragment path (fill shader):
if (strokeSetHasDashing) {
  // Per-curve arc-length: computed once at bake, in a per-glyph texture row
  const s_raw = contourArcLengthOffset + sampleArcLength(arcLengthRow, t_from_nearest_intersection)
  const s = mod(s_raw - dashOffset, dashPatternTotalLength)
  const inDash = binarySearchDashArray(s, dashArrayUniform)
  if (!inDash) discard
}
// ... existing winding-number coverage math
```

Binary search over an 8-deep uniform array is ~3 ALU ops per fragment. Comparable to the dash-interval check Slug's reference shader does. Negligible cost on top of fill.

Only enabled when the instance's stroke spec includes a dashArray — uniform branch is compile-time DCE'd otherwise.

### Out of scope for v1

- **Gradients (manual §3.1).** Fragment-shader math wrapped around coverage — follow-up.
- **Slot compaction / defragmentation.** Tombstones only.
- **SVG features beyond path `d`:** `<rect>`, `<circle>`, `<ellipse>`, `<polygon>` — callers synthesize to path `d`.
- **Variable-width strokes along a path.** Single width per stroke set.
- **Stroke rebake on (join/cap/miterLimit) mutation.** v1 requires matching a pre-baked set; mutating these keys at runtime falls through to async offset-bake. Good enough.

### Out of scope for v1

- **Gradients (manual §3.1).** Fragment-shader math wrapped around coverage — straightforward follow-up once v1 ships.
- **Slot compaction / defragmentation.** Tombstones only.
- **SVG features beyond path `d`:** `<rect>`, `<circle>`, `<ellipse>`, `<polygon>` — callers synthesize to path `d` or a later helper does.
- **Stroke-dashed closed contours with `dashOffset ≠ 0`.** Works, but `dashOffset` interacts with closed-contour arc-length wraparound in ways the manual doesn't fully pin down. Test cautiously; if edge cases pop up, clamp `dashOffset = 0` for closed contours in v1 with a `console.warn`.

### Files

- Create: `packages/slug/src/pipeline/strokeOffsetter.ts` — quadratic-Bezier adaptive offsetter. CPU, pure JS. Takes `(contours, halfWidth, joinStyle, capStyle, miterLimit) → offsetContours`.
- Create: `packages/slug/src/pipeline/strokeOffsetter.test.ts`.
- Create: `packages/slug/src/pipeline/arcLengthSampler.ts` — per-curve arc-length table builder. Runs inside the offsetter output pass.
- Create: `packages/slug/src/pipeline/arcLengthSampler.test.ts`.
- Create: `packages/slug/src/pipeline/texturePool.ts` — append allocator over curve + band textures. Append, tombstone, grow via `copyTextureToTexture`. Used by SlugShapeBatch and by the runtime offset-bake fallback.
- Create: `packages/slug/src/pipeline/texturePool.test.ts`.
- Create: `packages/slug/src/vector/svgPath.ts` — SVG `d`-attribute parser. Commands: M, m, L, l, H, h, V, v, Q, q, T, t, C, c, S, s, Z/z. Emits closed/open flag per contour.
- Create: `packages/slug/src/vector/svgPath.test.ts`.
- Create: `packages/slug/src/vector/SlugShapeBatch.ts` — `InstancedMesh` subclass.
- Create: `packages/slug/src/vector/SlugShapeBatch.test.ts`.
- Create: `packages/slug/src/vector/SlugShape.ts` — data factory, not a Mesh.
- Create: `packages/slug/src/SlugBaker.ts` — runtime offset-bake worker. Wraps `strokeOffsetter` for on-demand stroke generation when a requested (width, join, cap) isn't pre-baked. Runs in a Web Worker when available; falls back to synchronous main-thread for environments without Worker support.
- Create: `packages/slug/src/runtime/strokeSetCache.ts` — maps (shapeId, width, join, cap) → baked stroke-set data. Tracks pending async bakes so concurrent requests dedupe.
- Modify: `packages/slug/src/pipeline/fontParser.ts` — extract `buildContoursToGpuGlyph`. Used by font loading, shape append, and the offset-bake pipeline.
- Modify: `packages/slug/src/cli.ts` — add `--stroke-widths=W1,W2,W3 --stroke-join=miter --stroke-cap=flat --miter-limit=4` options. For each configured stroke tuple, run `strokeOffsetter` on every glyph contour, emit the resulting offset contours into a stroke-set section in the baked file.
- Modify: `packages/slug/src/baked.ts` — new baked-file section: stroke sets (per-glyph, per-(width,join,cap)). Baked-version bump so Phase 4 baked files are rejected with a clear "re-run slug-bake" message.
- Modify: `packages/slug/src/SlugFont.ts` — expose `getStrokeSet(glyphId, width, join, cap) → StrokeSetData | null`. Null = request an async runtime bake.
- Modify: `packages/slug/src/shaders/slugFragment.ts` (fill shader) — add optional dashing modifier gated on a uniform. No-op when no dash array is bound.
- Modify: `packages/slug/src/SlugMaterial.ts` — add `dashArray`, `dashOffset`, `arcLengthTexture` uniforms (all no-ops unless dashing is on).
- Modify: `packages/slug/src/SlugText.ts` — `outline` spec gains `join`, `cap`, `miterLimit`, `dashArray`, `dashOffset`. The SlugText renders an additional stroke-set mesh per configured outline, using `SlugMaterial` bound to the stroke-set's curve+band textures. `SlugStrokeMaterial` stays as the dev `mode: 'dynamic'` path — all existing Phase 4 code preserved.
- Modify: `packages/slug/src/index.ts`, `packages/slug/src/react/*` — exports + R3F wrappers for shape batching.

### Task 15: Extract shared contour → GPU pipeline

- [ ] **Step 15.1: Refactor `fontParser.ts`** — introduce `buildGpuGlyphFromContours(contours): { curveTable, bandTable, bounds, ... }`. Handles closed (font) and open (SVG) contours. Existing font-loading tests must still pass unchanged.
- [ ] **Step 15.2: Commit.** `refactor(slug): extract shared contour-to-GPU pipeline`

### Task 16: Quadratic-Bezier stroke offsetter

The core new build-time piece. Slug keeps this proprietary; ours is the open implementation.

- [ ] **Step 16.1: Adaptive subdivision CPU reference** — `subdivideForOffset(curve, halfWidth, epsilon): QuadCurve[]`. Recurse until each segment's offset can be approximated within ε by a single quadratic. Test: straight segment offsets to a straight segment (single output). High-curvature quad subdivides into ~3–5 segments at halfWidth=0.05. Max depth bounded at 8.
- [ ] **Step 16.2: Per-segment offset CPU** — `offsetSegment(curve, halfWidth): QuadCurve`. Offset p0, p1, p2 along their unit normals. Test: straight segment offsets correctly; gentle curve offsets cleanly; per-endpoint normal is derivative-based.
- [ ] **Step 16.3: Join insertion** — for each contour vertex between two curves, emit miter/round/bevel geometry between outer offset endpoints. `miterLimit` fallback: if miter length exceeds threshold, emit bevel instead. Test: sharp-corner glyph outline produces miter geometry at angle < 30°; with miterLimit=2 at same angle produces bevel.
- [ ] **Step 16.4: Cap insertion** — flat/square/round/triangle at open-contour endpoints. Test: a straight segment stroked with round caps produces a pill shape (verified via perimeter length).
- [ ] **Step 16.5: Inner + outer offset close** — glue inner and outer offsets at caps/joins to form one closed contour per original contour. Preserves winding. Test: stroked open segment produces one closed output; stroked circle produces one outer closed contour + one inner (reversed-winding) closed contour.
- [ ] **Step 16.6: Full offsetter API** — `strokeOffsetter(contours, { halfWidth, joinStyle, capStyle, miterLimit }): Contour[]`. Composes 16.1–16.5.
- [ ] **Step 16.7: Commit.** `feat(slug): quadratic-Bezier adaptive stroke offsetter`

### Task 17: Stroke-set bake integration in CLI

- [ ] **Step 17.1: Extend baked file format** — new section per-glyph: `strokeSets: Array<{ key, curveTable, bandTable, totalLength, arcLengthTable? }>` where `key = hash(width, joinStyle, capStyle, miterLimit)`. Baked-version bump; Phase 4 baked files error with "re-run slug-bake".
- [ ] **Step 17.2: CLI flag plumbing** — `slug-bake Inter.ttf --stroke-widths=0.025,0.05 --stroke-join=miter --stroke-cap=flat --miter-limit=4`. Multi-variant: `--stroke-widths=0.025,0.05 --stroke-joins=miter,round` bakes the cartesian product. Log output enumerates each emitted set.
- [ ] **Step 17.3: Unit test** — re-bake Inter with one stroke width, verify the baked file includes stroke sets with correct glyph curve counts. Load + assert `SlugFont.getStrokeSet(glyphId, 0.025, 'miter', 'flat').curveTable.length > 0`.
- [ ] **Step 17.4: Re-bake checked-in fixtures** with one default stroke set (`0.025, miter, flat, miterLimit=4`). Commit regenerated fixtures.
- [ ] **Step 17.5: Commit.** `feat(slug): stroke sets in baked format (CLI + file version bump)`

### Task 18: Fill shader dash-offset modifier

- [ ] **Step 18.1: Arc-length sampler** — `buildArcLengthTable(curve, N=16): Float32Array` Gaussian-quadrature cumulative. Test: straight line = `|p2 - p0|`, quarter-arc approximation within 0.5% of `π·r/2`.
- [ ] **Step 18.2: TSL `insideDash`** — `insideDash(s, dashArrayTexture, dashCount, dashOffset, totalLength): bool`. Modulo wrap + binary search (8-deep for max 256-entry dash arrays). Pure-JS twin for tests.
- [ ] **Step 18.3: Extend `slugFragment.ts`** — optional gate: read `s = contourArcLengthOffset + sampleArcLength(arcLengthRow, t_from_fill_ray)` inside the per-curve loop; if `!insideDash(s)` reject that curve's coverage contribution. Compile-time dead-code when no dash uniform is bound.
- [ ] **Step 18.4: `SlugMaterial` uniform additions** — `dashArray: Float32Array`, `dashOffset: number`, `arcLengthTexture: DataTexture`. All optional; null = dashing disabled.
- [ ] **Step 18.5: Visual regression** — dashed rectangle via SlugShapeBatch (anticipating Task 20) with `dashArray=[10,5]`, `dashOffset` sweeping from 0 to 15. Verify marching-ants animation.
- [ ] **Step 18.6: Commit.** `feat(slug): dash-offset modifier on fill shader`

### Task 19: SlugText outline → baked-set path

- [ ] **Step 19.1: Extend `SlugText.outline`** — accepts full stroke spec: `{ width, color, join?, cap?, miterLimit?, dashArray?, dashOffset?, mode? }`. `mode = 'baked' | 'dynamic'`. Default 'baked'.
- [ ] **Step 19.2: Baked-set lookup** — on outline config, SlugText calls `font.getStrokeSet(glyphId, width, join, cap)`. Present → create a child `InstancedMesh` using `SlugMaterial` bound to the stroke set's textures. Missing → dispatch `SlugBaker.buildOffset(...)` async; render fallback (no stroke, or 'dynamic' mode) while pending.
- [ ] **Step 19.3: Width-swap API** — changing `outline.width` to a different pre-baked value swaps the stroke set's texture binding only; glyph instance data untouched. Benchmark: width swap = zero per-frame cost delta vs steady-state outlined text.
- [ ] **Step 19.4: Dashing pass-through** — `dashOffset` uniform forwarded to stroke-set material. Tweakpane scrub of `dashOffset` visibly animates marching ants with no rebuild.
- [ ] **Step 19.5: Commit.** `feat(slug): SlugText.outline baked-as-fill path + width-swap + dashing`

### Task 20: Texture pool + runtime offset-bake

- [ ] **Step 20.1: Implement `texturePool.ts`** — append allocator over (curve, band, arcLength) textures. Append, tombstone, grow via `copyTextureToTexture`. Tests cover grow + tombstone behavior.
- [ ] **Step 20.2: Implement `SlugBaker`** — wraps `strokeOffsetter` for on-demand stroke generation. Web Worker when available; sync main-thread fallback. Returns a promise that resolves when the texture pool has the new stroke set.
- [ ] **Step 20.3: Runtime fallback path** — `strokeSetCache` maps (glyphId or shapeId, width, join, cap) → handle. Dedup concurrent requests. On completion, material's texture bindings update; R3F re-renders next frame.
- [ ] **Step 20.4: Integration test** — SlugText.outline at width=0.04 (not pre-baked). Assert: first frame renders with fallback, subsequent frames render baked. Second load at same width is instant (cache warm).
- [ ] **Step 20.5: Commit.** `feat(slug): texture pool + runtime async stroke offsetter`

### Task 21: SVG path parser

- [ ] **Step 21.1: Test** — `parseSvgPath('M0 0 L10 0 L10 10 Z')` returns one closed contour. `parseSvgPath('M0 0 Q5 10 10 0')` one open contour. Cubic → N quads via shared util. Multi-contour paths separate correctly.
- [ ] **Step 21.2: Implement `svgPath.ts`** — state machine, cubic split, y-flip from SVG coords.
- [ ] **Step 21.3: Commit.** `feat(slug): SVG path-d parser`

### Task 22: SlugShapeBatch

- [ ] **Step 22.1: Test** — create batch, add filled closed path + stroked open path with dash. Remove + re-add. Verify `drawCalls === 1` per batch.
- [ ] **Step 22.2: Implement `SlugShapeBatch`** — one `InstancedMesh`, curve + band textures via pool, instance attributes select per-shape stroke set. Fill-only and stroke-only batches. Mixed shapes = same batch; per-instance stroke spec.
  ```ts
  class SlugShapeBatch extends InstancedMesh {
    constructor(options?: { capacity?: number })
    add(shape: SlugShape, transform: {
      x, y, scale?, rotation?, color?,
      stroke?: StrokeSpec,  // see earlier — width/join/cap/dash
    }): ShapeHandle
    remove(handle: ShapeHandle): void
    update(renderer: Renderer, camera?: Camera): void
    dispose(): void
  }
  ```
- [ ] **Step 22.3: Commit.** `feat(slug): SlugShapeBatch with baked-stroke path`

### Task 23: Factory + examples + docs

- [ ] **Step 23.1:** `SlugShape.fromSvg(d, { strokeSpecs? })` — data factory; optional pre-bake of common stroke variants.
- [ ] **Step 23.2:** R3F wrappers + `pnpm sync:react`.
- [ ] **Step 23.3:** `examples/{three,react}/slug-shapes/` — three demos:
  1. **Icons** — 20–50 filled icons in one batch; `drawCalls === 1` monitor.
  2. **Width swap** — stroked shape with Tweakpane radio flipping between 3 pre-baked widths (0.02, 0.05, 0.10). Frame-time monitor visibly flat across swaps.
  3. **Marching ants** — open path with `dashArray` preset + animated `dashOffset` slider. Confirms dash-offset animation at zero per-frame cost.
- [ ] **Step 23.4:** Extend `examples/{three,react}/slug-text/` — Outline folder gets `join`/`cap`/`miterLimit` radios (require re-bake, so marked as dev-only in the UI) and `dashOffset` slider (live).
- [ ] **Step 23.5:** Docs + `astro.config.mjs` entry + commit.

### Phase 5 shipping gate

- Baked-as-fill stroked text matches Canvas2D `strokeText` on goldens (tighter than Phase 4's bevel-via-min relaxation).
- Width swap among pre-baked set: zero measured per-frame delta vs steady-state stroked text.
- `dashOffset` animates smoothly at 60fps on M2 with zero frame-time increase vs static.
- `SlugShapeBatch` draws 20+ shapes in 1 draw call.
- Runtime fallback path works: requesting an unbaked width resolves to baked within 2 frames and thereafter renders at fill cost.
- Interactive verification in both examples.

---

## Phase 6 — Rich Text

Own data model on top of the above primitives. No new GPU work.

**Files:**
- Create: `packages/slug/src/rich/RichText.ts` — data model + compiler
- Create: `packages/slug/src/rich/RichText.test.ts`
- Create: `packages/slug/src/rich/SlugRichText.ts` — `Object3D` wrapper creating per-run `SlugText` children
- Modify: `packages/slug/src/index.ts`
- Modify: `packages/slug/src/react/` — add `<slugRichText>` JSX element via `ThreeElements` augmentation + sync-react-subpaths

### Task 22: RichText data model

```ts
export type RichRun = {
  text: string
  font?: SlugFont | SlugFontStack      // inherits if omitted
  fontSize?: number
  color?: number | Color
  styles?: StyleFlags                  // bold-via-weightBoost, italic offset, underline, strike, super, sub
}
export type RichText = { runs: RichRun[]; align?: 'left'|'center'|'right'; lineHeight?: number; maxWidth?: number }
```

- [ ] **Step 22.1: Test** — `compileRichText(rt, defaults)` produces the same positioning as shaping the concatenated string when all runs share font/size.
- [ ] **Step 22.2: Implement compiler** — single-pass shaping across runs: maintain `cursorX`, `cursorY`; for a run, call its font's `shapeText` with `maxWidth - cursorX`, translate positions by `cursorX`, handle wrap by splitting run into continuation.
- [ ] **Step 22.3: Commit.**

### Task 23: SlugRichText mesh wrapper

- [ ] **Step 23.1: Implement** — for each `(font, style, color)` group emit one `SlugText` parented to the root; if the style requests stroked outline, the existing `SlugText.outline` path handles it. Dirty-only rebuild, same pattern as `SlugText`.
- [ ] **Step 23.2: React wrapper** — `react/rich/index.ts` + update `sync-react-subpaths.ts` to pick it up. Run `pnpm sync:react`.
- [ ] **Step 23.3: Example** — `examples/{three,react}/slug-rich-text/` with a short styled paragraph (bold headline, colored span, superscript footnote ref, underlined link).
- [ ] **Step 23.4: Docs (`docs/.../guides/slug-rich-text.mdx` + `examples/slug-rich-text.mdx`) + `astro.config.mjs` entry + commit.**

---

## Phase 7 — Changesets, Release, Roadmap

- [ ] **Step 24.1:** Per phase landed, run `pnpm changeset` and pick `minor` for every new public API (measurement, styles, stacks, stroke, vector, rich text). Individual PRs preferred — one phase per PR off `feat-slug`.
- [ ] **Step 24.2:** Update `packages/slug/README.md` Roadmap section: check off "General shape rendering", "Runtime-uniform stroked text with SVG joins"; add "Color emoji (COLR/CPAL)" and "Dash arrays" as remaining.
- [ ] **Step 24.3:** After Phase 1 lands, update PR #20 description with a checklist mirroring @astralarya's comment, ticking boxes as phases merge.

---

## Self-Review

**Spec coverage:**
| @astralarya bullet | Phase |
|---|---|
| Multiple fonts (fallback for missing glyphs eg. emoji) | Phase 3 |
| Font metrics (measuring dimensions of characters / spans) | Phase 1 |
| Font outlines (outline contours, Slug manual p.45) | Phase 4 (analytic, runtime-uniform, bevel-via-min, crispness-gated); Phase 5 upgrades to explicit miter + round joins + `miterLimit` |
| Vector graphics — fills, joins, caps, dashing (Slug manual ch.3) | Phase 5 (`SlugShapeBatch` + full SVG stroke surface) |
| Font styles (underline, strikethrough, super/sub, p.20, 24) | Phase 2 |
| Rich text | Phase 6 |

**Phase 4 ↔ Phase 5 handshake (re-scoped 2026-04-14 round 2 — runtime-cost pivot):**
- Phase 4 shipped the dynamic analytic-distance stroke shader (`slugStroke` + `SlugStrokeMaterial`). Works end-to-end, nice for dev iteration. **Kept as `outline: { mode: 'dynamic' }` opt-in forever; no more invested in it after Phase 4.**
- Phase 5 commits to the ship path: **offset-contour bake at build time, rendered through the fill shader.** 1× fill cost for stroked text, same as glyph fills. Join/cap/miterLimit baked; width is a per-stroke-set lookup (pre-baked set → instant swap, unbaked → async CPU offsetter warms the cache). Dashing = fill-shader modifier (one float uniform).
- Why this pivot after Phase 4 shipped dynamic: M2 benching showed ~2.6× fill cost for dynamic stroke per fragment, which is unaffordable on top of the existing 3–4ms text budget once gameplay is added. The realtime-animatable audit (see Phase 5 preamble) confirms that no real product use case needs the dynamic shader except continuous width scrubbing, which the async offsetter path handles via 1-frame fallback.

**What stays dynamic in Phase 5:**
- Dash offset (marching ants) — single float uniform on the fill shader.
- Pre-baked stroke width swap — texture-slot swap, no shader cost.
- All the existing SlugMaterial uniforms (color, opacity, stem-darken, thicken, viewport, MVP).

**What requires rebake (dev-mode or build-time):**
- Continuous stroke width — async offsetter fallback on first use; cached thereafter.
- Join style / cap style / miterLimit — rebake-only in v1; exposed in examples as dev-mode controls that trigger async offsetter.

**Task-numbering note:** Phase 4 shipped as Tasks 9–14. Phase 5 new shape: 15–23. Phase 6 RichText = 24–25. Phase 7 release = 26. Previous Phase 5 tasks (in-shader joins/caps/dashing) are fully deprecated — the new Phase 5 takes a different architecture.

**Placeholder scan:** offsetter epsilon (`ε = 0.01·halfWidth`), subdivision depth cap (8), arc-length sample count (`N=16`) are the three tunables. Each benched in its owning task.

**Type consistency:** `StrokeSpec` (width/color/join/cap/miterLimit/dashArray/dashOffset/mode) used consistently across `SlugText.outline`, `SlugShapeBatch.add()`, and `SlugFont.getStrokeSet()`. `strokeHalfWidth` retained as the Phase-4 dynamic-path uniform name for backward compat.

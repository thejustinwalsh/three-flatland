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

## Phase 5 — Generic Vector Graphics (Slug manual ch.3 — full stroke surface)

**Scope expanded (2026-04-14):** everything Phase 4 deferred lands here, because open paths actually need it. This phase is bigger than Phase 4 by design — it closes the full SVG-level stroke API: explicit miter joins with `miterLimit` fallback, round joins, all four cap styles (`flat` / `square` / `round` / `triangle`), and arbitrary dashing with `dashOffset`. On top of that sits `SlugShapeBatch` — the retained-mode batch allocator Slug uses for generic shape rendering — and an SVG path-d parser.

**Why it belongs together:** the stroke-shader extensions (joins, caps, dashing) only become *visible* on arbitrary open paths. Landing them in a vacuum without `SlugShapeBatch` leaves the features untestable and the demos contrived. Landing `SlugShapeBatch` without them leaves strokes looking like Phase 4 bevels, which is wrong for shape rendering. Shipping them together gives one coherent "you can now do SVG" milestone.

### Architecture

**`SlugShapeBatch`** — one `InstancedMesh` subclass owning a (curve, band) texture pair, reused `SlugMaterial` or `SlugStrokeMaterial`, reused `SlugGeometry` instance-attribute layout. Shapes are glyph-shaped instances. Each batch is one draw call regardless of shape count.

Matches Slug's native model exactly (confirmed against manual §3.1, §3.2, ch.3):
- Retained-mode, count-then-create. Mirror `CountFill` / `CreateFill` / `CountStroke` / `CreateStroke`: `batch.countShape(contours) → { curveTexels, bandTexels }` then `batch.appendShape(contours) → ShapeHandle`.
- **Caller-owned append cursor** on the (curve, band) textures — same as Slug's `curveWriteLocation` / `bandWriteLocation` in/out pattern.
- **No compaction in v1.** Add appends; remove tombstones (drop instance, leak the slot). Fragmentation recovery is a later knob.
- **Strokes don't generate band data** (manual §4430) for standalone shapes — the stroke shader walks all curves of the shape per-fragment. Our twist: we *do* build bands for shapes too, because the stroke-width halo probe matches what fills need; reusing the band path keeps per-fragment cost sub-linear in curve count. Fall back to linear walk only if `bands.length === 0` (degenerate shape).
- **Texture format constraint:** curve + band textures are 4096-wide strips, grow in height by pow2 doubling. Exceeding capacity = one full re-upload (amortized cheap). Partial adds = `renderer.copyTextureToTexture` of only the new rows.

### Stroke-shader extensions (moved from Phase 4)

Phase 4's `slugStroke.ts` left labeled extension points; this phase fills them.

**Joins.** Endpoint-aware classifier replaces the naive `min(d)`:
```
(d, t) = distanceToQuadBezier(coord, curve)
if t ≤ 0 and curve has prevTangent:
  // start-side join with curve A→this
  dispatch(joinStyle): {
    miter: miter-extension clip (with miterLimit fallback to bevel)
    round: accept d (capsule extends naturally)
    bevel: clip to bevel triangle
  }
else if t ≥ 1 and curve has nextTangent:
  // end-side join with this→curve B
  (same dispatch)
else:
  accept d (body)
```
- **Miter (default for shapes):** compute outer-side bisector. If the fragment is in the mitered triangular extension (bounded by the two outer offset edges out to their intersection), accept with perpendicular-to-bisector distance. `miterLength = halfWidth / sin(angleBetween/2)`; if `miterLength > miterLimit × halfWidth`, fall through to bevel. SVG default: `miterLimit = 4`.
- **Round:** accept `d` unconditionally at endpoint region — distance field at the endpoint naturally produces a semicircular capsule end.
- **Bevel:** reject outside the bevel triangle (bounded by the two outer offset points and the shared vertex); min-distance elsewhere. Matches Phase 4's bevel-via-min but now *explicit* so `miterLimit` fallback has a target.

**Caps.** Applied at contour endpoints where `prevTangent` or `nextTangent` is the zero vector (open-contour end marker):
- **Flat:** reject fragments beyond the tangent plane at the endpoint (stroke ends precisely at final control point).
- **Square:** accept fragments within `halfWidth` past the endpoint along the tangent (half-square extension).
- **Round:** accept `d` unconditionally — the capsule end is a semicircle.
- **Triangle:** accept fragments inside the isosceles triangle extending `halfWidth` past the endpoint.

Per manual §987–996: when `capStyle ≠ flat`, caps apply to both ends of each individual dash; and when two curves meet *inside* a dash (not inside a gap), the `miterLimit` + `joinStyle` determine the corner. Dashing logic must therefore cooperate with join classification.

**Dashing.** Per Slug manual §987–996 and `StrokeData` (§8064–8095):
- `dashCount`: even number ≤ 256 (sum of dash + gap entries).
- `dashArray[0..dashCount-1]`: alternating `(dashLen, gapLen, dashLen, gapLen, …)`.
- `dashOffset`: starting arc-length into the dash pattern.
- At each fragment: compute arc-length `s(t)` along the containing curve, add the accumulated arc-length of all preceding curves in the contour, subtract `dashOffset`, wrap modulo `sum(dashArray)`. If the result lands in a dash interval, continue; if in a gap, reject.

Arc-length parametrization of a quadratic Bezier doesn't have a closed form (elliptic integral), so we pre-compute a table per curve at shape-creation time:
- Baked sample: `N` segments of equal `Δt`, cumulative `s(t_i)`.
- Stored as a texel row appended to the curve texture when the shape has dashing enabled.
- Stored into a new per-curve `arcLengthTableRow` field (row index in a separate RG16F arc-length texture, or null if no dashing).
- Fragment shader: reads `N` table rows, does binary search on `t` (the closest-point `t` from `distanceToQuadBezier`) to interpolate `s(t)`.

`N = 16` is a starting value — delivers ~1% arc-length accuracy for typical cubic-derived quads. Benchmark Task 19's arc-length fidelity against CPU reference; adjust if dashing visibly slips.

**Contour arc-length accumulation.** Per-contour prefix-sum of curve total lengths is also stored — per curve as a single `contourArcLengthOffset` float. Fragment shader reads this + `s(t)` to get the global arc-length along the contour.

### Data model (curve-texture layout v2)

Phase 4 kept the 2-texel curve layout. Phase 5 bumps to the full layout Phase 4 left documented:

Per-curve (3 texels for joins/caps, +1 texel if arc-length table row referenced for dashing):
```
texel 0: p0.xy, p1.xy       // endpoint sharing with previous curve preserved
texel 1: p2.xy, flags_packed, arcLengthTableRow (or 0)
texel 2: prevTangent.xy, nextTangent.xy
         // prevTangent.xy = (0,0) if contour start
         // nextTangent.xy = (0,0) if contour end
         // magnitude 1.0 encoded; (0,0) reserved as sentinel
```

Arc-length texture (RG16F, 4096-wide, present only if any shape in the batch uses dashing):
```
row per curve containing N+1 cumulative arc-length samples
column 0 = 0.0, column N = curve total length
```

**Backward compatibility.** Phase 4 ships with 2-texel curves. Phase 5 bumps to 3-texel. `BAKED_VERSION` increments; old baked files must error with a clear "re-run `slug-bake`" message. Re-bake checked-in Inter fixtures alongside the format change.

Per-shape storage within `SlugShapeBatch` uses the same layout. `SlugShape.fromSvg(d)` emits this layout directly; `SlugFont` loading via the shared extract pipeline from Task 16 emits it too.

### Out of scope for v1

- **Gradients (manual §3.1).** Fragment-shader math wrapped around coverage — straightforward follow-up once v1 ships.
- **Slot compaction / defragmentation.** Tombstones only.
- **SVG features beyond path `d`:** `<rect>`, `<circle>`, `<ellipse>`, `<polygon>` — callers synthesize to path `d` or a later helper does.
- **Stroke-dashed closed contours with `dashOffset ≠ 0`.** Works, but `dashOffset` interacts with closed-contour arc-length wraparound in ways the manual doesn't fully pin down. Test cautiously; if edge cases pop up, clamp `dashOffset = 0` for closed contours in v1 with a `console.warn`.

### Files

- Create: `packages/slug/src/pipeline/texturePool.ts` — append allocator over a (curve, band, arc-length) texture triple. Append, tombstone, track capacity, grow via `copyTextureToTexture`.
- Create: `packages/slug/src/pipeline/texturePool.test.ts`.
- Create: `packages/slug/src/pipeline/arcLengthSampler.ts` — per-curve arc-length table builder. Pure-JS, pure-TSL read helper.
- Create: `packages/slug/src/pipeline/arcLengthSampler.test.ts`.
- Create: `packages/slug/src/vector/svgPath.ts` — SVG `d`-attribute parser producing contours of quadratic Beziers. Commands: M, m, L, l, H, h, V, v, Q, q, T, t, C, c, S, s, Z/z. Emits closed/open flag per contour.
- Create: `packages/slug/src/vector/svgPath.test.ts`.
- Create: `packages/slug/src/vector/SlugShapeBatch.ts` — `InstancedMesh` subclass.
- Create: `packages/slug/src/vector/SlugShapeBatch.test.ts`.
- Create: `packages/slug/src/vector/SlugShape.ts` — data factory, not a Mesh.
- Create: `packages/slug/src/shaders/joins.ts` — small TSL helpers: `insideMiterTriangle`, `insideBevelTriangle`, `bisectorClipDistance`, `miterLengthExceeds`.
- Create: `packages/slug/src/shaders/caps.ts` — TSL helpers: `flatCap`, `squareCap`, `roundCap`, `triangleCap` (each returns coverage-accept decision + possibly-adjusted distance).
- Create: `packages/slug/src/shaders/dashing.ts` — TSL helper: `insideDash(s, dashArray, dashCount, dashOffset)` using binary-search table reads.
- Modify: `packages/slug/src/pipeline/fontParser.ts` — Task 16 extracts `buildContoursToGpuGlyph`. Emits the 3-texel layout with neighbor tangents. `SlugFont` loading + `SlugShapeBatch.appendShape` both use it.
- Modify: `packages/slug/src/pipeline/texturePacker.ts` — 2 → 3 texels per curve, optional 4th for arc-length row index.
- Modify: `packages/slug/src/shaders/slugStroke.ts` — fill in Phase 4's extension points: endpoint classifier, miter/round/bevel join dispatch, cap-style dispatch at contour endpoints, dash-interval clipping.
- Modify: `packages/slug/src/SlugStrokeMaterial.ts` — add `joinStyle: 0|1|2`, `miterLimit`, `capStyle: 0|1|2|3`, `dashCount`, `dashOffset`, `dashArrayTexture` uniforms.
- Modify: `packages/slug/src/baked.ts` — bump `BAKED_VERSION`, 3-texel per-curve encode/decode, optional arc-length section.
- Modify: `packages/slug/src/cli.ts` — emit neighbor tangents, optional arc-length tables.
- Modify: `packages/slug/src/index.ts`, `packages/slug/src/react/*` — exports + R3F wrappers.
- Modify: `packages/slug/src/SlugText.ts` — extend `outline` config with `join`, `miterLimit`, `cap` (cap is no-op for closed contours but accept the prop for API consistency with `SlugShapeBatch`).

### Task 15: Extract shared contour → GPU data pipeline

- [ ] **Step 15.1: Refactor `fontParser.ts`** — introduce `buildGpuGlyphFromContours(contours, options): { glyph: SlugGlyphData, curveTexelsNeeded: number, bandTexelsNeeded: number }`. Emits the 3-texel layout (p0/p1/p2, flags, tangents). Handles both closed (contours from fonts) and open (contours from SVG) inputs. Existing font-loading tests must still pass with re-baked fixtures.
- [ ] **Step 15.2: Extend pure-JS `fontParser`** to populate neighbor tangents (start, end, prev, next). Tangents are unit derivatives of the Bezier at p0/p2. Contour-start's `prevTangent = (0,0)`; contour-end's `nextTangent = (0,0)`. Tests: on `O` (smooth) prev/next match start/end of neighbours; on `A` (one sharp exterior tip at top) the angle jump is present; on dot-over-`i` (separate contour) the prev/next are zero.
- [ ] **Step 15.3: Extend `texturePacker.ts`** from 2 → 3 texels per curve. Bump `BAKED_VERSION`. Old baked files throw a clear "re-run slug-bake" error.
- [ ] **Step 15.4: Re-bake** the checked-in Inter + FA fixtures (both example public dirs). Commit regenerated fixtures alongside.
- [ ] **Step 15.5: Commit.** `refactor(slug): 3-texel curve layout with neighbor tangents (baked v2)`

### Task 16: Texture pool (append allocator)

- [ ] **Step 16.1: Test** `texturePool.test.ts`. Pool with initial height 32 rows. Append a 10-row entry → cursor advances. Append a 25-row entry → grows texture (height 64), full re-upload, cursor advances. Tombstone first entry → live count decreases, cursor doesn't move. Arc-length texture grows independently when any appended shape has dashing enabled.
- [ ] **Step 16.2: Implement `texturePool.ts`.** Wrap curve (RGBA16F, 4096-wide), band (RG32F, 4096-wide), and optional arc-length (RG16F, 4096-wide) `DataTexture`s. `append(curveData, bandData, arcLengthData?) → Handle`, `remove(handle)`, `flushUploads(renderer)` via `renderer.copyTextureToTexture` from a staging DataTexture. On grow, allocate new pow2 DataTexture, blit old content, dispose old.
- [ ] **Step 16.3: Commit.** `feat(slug): append-only curve/band/arc-length texture pool`

### Task 17: SVG path parser

- [ ] **Step 17.1: Test** — `parseSvgPath('M0 0 L10 0 L10 10 Z')` returns one closed contour with 3 quads. `parseSvgPath('M0 0 Q5 10 10 0')` returns one open contour, 1 curve. `parseSvgPath('M0 0 C0 5 5 10 10 10')` splits the cubic into N quads. `parseSvgPath('M0 0 L10 0 M20 0 L30 0')` returns two separate contours. Closed vs open contour flag propagated so the renderer applies caps vs joins correctly.
- [ ] **Step 17.2: Implement `svgPath.ts`.** State machine over command letters. Cubic → quadratic via the shared util from Task 15. Y-axis: SVG is y-down, convert to y-up at parse time.
- [ ] **Step 17.3: Commit.** `feat(slug): SVG path-d parser`

### Task 18: Explicit join logic (miter / round / bevel) in stroke shader

Extends Phase 4's `slugStroke.ts` extension points.

- [ ] **Step 18.1: CPU reference** — `strokeCoverage(shape, coord, halfWidth, joinStyle, miterLimit)`. Unit test on A's top tip (miter produces sharp point; at acute angle `miterLimit=4` kicks in and falls back to bevel; `miterLimit=2` kicks in at less-acute angle). H's interior corner stays crisp for all join styles (that's the distance field, not the join logic). O has no joins.
- [ ] **Step 18.2: `joins.ts` TSL helpers** — `insideMiterTriangle`, `insideBevelTriangle`, `bisectorClipDistance`, `miterLengthExceeds(halfWidth, angle, miterLimit): bool`. Pure-JS twins in `joins.test.ts`.
- [ ] **Step 18.3: Wire into `slugStroke.ts`** — replace Phase 4's stubbed classifier with the real endpoint dispatch. Compile-time uniform-bool `select` per join style so unused branches DCE per backend.
- [ ] **Step 18.4: GPU-vs-CPU parity** on the sharp-corner corpus (A, V, W, M, K, serif capital I with slab serifs) at halfWidth ∈ {0.02, 0.05, 0.10}. Max pixel delta < 1/255 across 32×32 grids.
- [ ] **Step 18.5: Visual regression on text** — SlugText with the new join logic, miter default, miterLimit=4. Assert tips on AVWMK are sharper than Phase 4's bevel-via-min baseline. Re-run the Phase 4 crispness gate; with the exterior-tip relaxed tolerance removed, golden diffs against Canvas2D's `strokeText` should now match in the body *and* at tips.
- [ ] **Step 18.6: Commit.** `feat(slug): explicit miter/round/bevel joins in stroke shader`

### Task 19: Cap style logic in stroke shader

- [ ] **Step 19.1: CPU reference** — `strokeCoverage(shape, coord, halfWidth, joinStyle, capStyle, miterLimit)`. Unit test flat cap on a straight segment (no extension past endpoint), square cap (extends `halfWidth` past endpoint along tangent), round cap (semicircle accepted), triangle cap (isosceles triangle accepted). Verify: the four corners where caps meet the stroke on a rectangular open path stay sharp (no visible corner gap or overlap).
- [ ] **Step 19.2: `caps.ts` TSL helpers** — `flatCap`, `squareCap`, `roundCap`, `triangleCap`. Each takes `(coord, endpoint, tangent, halfWidth): { accept: bool, distance: float }` and returns whether the fragment is inside the cap region + a (possibly adjusted) distance for coverage smoothstep.
- [ ] **Step 19.3: Wire into `slugStroke.ts`** — at endpoint hits where `prevTangent` or `nextTangent` is the zero sentinel, dispatch on `capStyle` uniform. Closed contours never hit this branch (their endpoints always have neighbour tangents).
- [ ] **Step 19.4: GPU-vs-CPU parity** on a cap-exercise path: `M 0 0 L 100 0` with each of flat/square/round/triangle at halfWidth=5.
- [ ] **Step 19.5: Commit.** `feat(slug): cap styles (flat/square/round/triangle) in stroke shader`

### Task 20: Dashing

- [ ] **Step 20.1: Arc-length sampler CPU reference** — `buildArcLengthTable(curve, N=16): Float32Array`. Gaussian-quadrature integration of `|B'(t)|` at N+1 sample points cumulatively, or simpler piecewise-linear approximation with N segments. Test against known curve lengths (straight line: exactly `|p2 − p0|`; quarter-circle approximation: within 0.5% of `π·r/2`).
- [ ] **Step 20.2: Per-contour arc-length prefix sum** — each curve stores `contourArcLengthOffset` = sum of lengths of preceding curves in its contour.
- [ ] **Step 20.3: `dashing.ts` TSL helper** — `insideDash(s, dashArrayTexture, dashCount, dashOffset): bool`. Binary search over the dash-array's cumulative prefix sums (pre-computed CPU-side and stored as a texture uniform because dash arrays are per-shape). Handles `dashOffset` and modulo-wrap.
- [ ] **Step 20.4: Wire into `slugStroke.ts`** — at any fragment hit, read `(d, t)` from `distanceToQuadBezier`, compute `s = contourArcLengthOffset + sampleArcLength(arcLengthTableRow, t)`, consult `insideDash`. If in a gap, reject. Joins inside dashes: the endpoint classifier still fires if the fragment hits a join-region, but the join-rejection-or-acceptance is gated on `insideDash` of both the curve and its neighbour. Caps apply to both ends of each dash when `capStyle ≠ flat`.
- [ ] **Step 20.5: GPU-vs-CPU parity** on a dashed open path: `M 0 0 L 100 0` with `dashArray=[10, 5]`, `dashOffset ∈ {0, 5, 12}`. Verify dashes land at expected arc-length intervals, caps apply per-dash when `capStyle=round`, `dashOffset=12` shifts the pattern correctly (first visible dash ends at s=3).
- [ ] **Step 20.6: Manual edge case** — closed contour with dashing and `dashOffset ≠ 0`: confirm wraparound behaves. If edge cases show up, clamp `dashOffset = 0` on closed contours with a `console.warn("Slug: dashOffset ignored on closed contour — wraparound undefined in v1")`.
- [ ] **Step 20.7: Commit.** `feat(slug): dashing with arc-length tables (v1 — open contours, closed with dashOffset=0)`

### Task 21: SlugShapeBatch

- [ ] **Step 21.1: Test** — create batch, add two shapes (one filled closed path, one stroked open path with miter joins + square caps + dashed), render, assert both visible with expected style. Remove first (tombstone), assert second renders, first is gone. Add a third; appended at cursor.
- [ ] **Step 21.2: Implement `SlugShapeBatch`** extending `InstancedMesh`:
  ```ts
  class SlugShapeBatch extends InstancedMesh {
    constructor(options?: { capacity?: number; mode?: 'fill' | 'stroke' })
    add(shape: SlugShape, transform: {
      x, y, scale?, rotation?, color?,
      stroke?: {
        width, color, join?, cap?, miterLimit?,
        dashArray?: number[], dashOffset?: number,
      },
    }): ShapeHandle
    remove(handle: ShapeHandle): void
    update(renderer: Renderer, camera?: Camera): void
    dispose(): void
  }
  ```
  Fill mode uses `SlugMaterial`; stroke mode uses the Phase-5 `SlugStrokeMaterial`. One batch = one material; for mixed fill+stroke the user creates two batches (matches Slug's separate `CreateFill` / `CreateStroke`).
- [ ] **Step 21.3: Commit.** `feat(slug): SlugShapeBatch — batched vector shape rendering`

### Task 22: SlugText outline upgrade (joins + miterLimit)

Cheap follow-up now that join logic exists.

- [ ] **Step 22.1: Extend `SlugText.outline`** — optional `join: 'miter' | 'round' | 'bevel'` (default miter), `miterLimit: number` (default 4). Mutation updates uniforms in place.
- [ ] **Step 22.2: Tighten the Phase 4 crispness gate** — re-enable strict exterior-tip golden comparison against Canvas2D `strokeText`. Mean + max pixel delta should now meet Phase-4-intended thresholds at sharp tips.
- [ ] **Step 22.3: Commit.** `feat(slug): SlugText.outline — miter/round/bevel joins + miterLimit`

### Task 23: Factory + examples + docs

- [ ] **Step 23.1:** `SlugShape.fromSvg(d)` returns `{ contours, bounds, isClosed }`. No Mesh. No material. Data only.
- [ ] **Step 23.2:** R3F wrappers `<slugShapeBatch>` + declarative `<slugShape d=... />` children, auto-add/remove on mount/unmount. Run `pnpm sync:react`.
- [ ] **Step 23.3:** `examples/{three,react}/slug-shapes/` with three live demos on one page:
  1. **Icons** — 20–50 filled icons in one batch; monitor `renderer.info.render.drawCalls === 1` via Tweakpane.
  2. **Stroke joins** — a star with a slider that sweeps `miterLimit` from 1 to 10, visibly flipping miter→bevel; side-by-side comparison with `joinStyle=round`. Tweakpane controls: `joinStyle`, `miterLimit`, `strokeWidth`.
  3. **Caps + dashing** — an open zigzag path with controls for `capStyle` (flat/square/round/triangle), `dashArray` (preset dropdown: solid, `[10,5]`, `[15,5,5,5]`), `dashOffset` slider.
- [ ] **Step 23.4:** Extend `examples/{three,react}/slug-text/` with the new outline join controls: `join: [Miter | Round | Bevel]` radio, `miterLimit` slider.
- [ ] **Step 23.5:** Docs + `astro.config.mjs` entry + commit.

### Phase 5 shipping gate

Phase 5 doesn't ship until:
- All Phase 4 crispness goldens pass with the stricter tolerance (miter tips match Canvas2D).
- Cap-style visual regression on `M 0 0 L 100 0` for all four caps matches CPU reference pixel-for-pixel.
- Dashing visual regression on `M 0 0 L 100 0` with `[10, 5]` matches CPU reference.
- `drawCalls === 1` assertion on the 20–50 icons demo.
- Interactive verification in a dev build: user clicks through join/cap/dash controls on both examples and confirms it visibly works.

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

**Phase 4 ↔ Phase 5 handshake (re-scoped 2026-04-14):**
- Phase 4 ships the distance-to-curve primitive, the `SlugStrokeMaterial` skeleton with uniform slots reserved for Phase 5, crispness-gated coverage, and bevel-via-min joins for text. **No explicit joins, caps, or dashing.**
- Phase 5 lands everything deferred: 3-texel curve layout with neighbor tangents (+ baked-format bump), explicit miter/round/bevel join dispatch with `miterLimit` fallback, all four cap styles (flat/square/round/triangle), arc-length tables + dashing + `dashOffset`, and `SlugShapeBatch`. It also retroactively tightens Phase 4's crispness gate on text by upgrading `SlugText.outline` to miter joins by default.
- Why merge all of that into one phase: joins/caps/dashing only become *visible* on arbitrary open paths, which only exist once `SlugShapeBatch` does. Landing them in separate phases leaves each half untestable.

**Task-numbering note:** old Phase 4 Tasks 9–15 (5 shader + integration + crispness) collapse to new Phase 4 Tasks 9–14 (bevel-via-min flavour only). Old Phase 5 Tasks 16–21 expand to new Phase 5 Tasks 15–23. Phase 6 RichText tasks remain 22–23, now renumbered 24–25 as the last content phase before 24.x release.

**Placeholder scan:** algorithmic sketches in Phases 4–6 intentionally leave inner code to the implementation step — each step has a concrete test + file list. Arc-length table size (`N=16`) is the one tunable; Task 20.1 benches it.

**Type consistency:** `SlugFontStack.resolveCodepoint` (Task 6) / `shaperStack` (Task 7) / `SlugText.font: SlugFont | SlugFontStack` (Task 8) align. `StyleSpan`/`StyleFlags` used consistently from Phase 2 onward. `strokeHalfWidth`/`joinStyle`/`miterLimit`/`capStyle`/`dashCount`/`dashOffset` named consistently across Phase 4 material skeleton and Phase 5 extensions.

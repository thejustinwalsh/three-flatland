# uikit fork → TSL + Slug: execution plan

**Spec:** `planning/superpowers/specs/2026-07-10-uikit-fork-tsl-slug-design.md`
**Branch:** `feat/uikit-fork` (worktree `.claude/worktrees/uikit-fork`) — one PR.
**Sources:** uikit clone @ `0d4d887`; `three@0.183.1`; `@three-flatland/slug@0.1.0-alpha.3`.

Acceptance criteria are a hard gate in this repo: every item below is met, or carries an
explicit stakeholder-authorized deferral, before the PR is marked ready. Open decision
points D1–D4 (spec §14) must be resolved before their owning phase starts.

## Repo mechanics (apply throughout)

- Conventional Commits; releases cut from **auto-generated** changesets — never
  hand-write changesets (`.changeset/CLAUDE.md`); repo is in alpha pre-release mode.
- New packages are release-visible iff `private !== true` and not in
  `.changeset/config.json` ignore. New uikit packages start at `0.1.0-alpha.0` intent,
  public from the start (versions materialize from commit history).
- Prettier: no semicolons, single quotes, trailing commas. `type` keyword on type-only
  imports (`verbatimModuleSyntax`). Unused vars prefixed `_`.
- **No catalog bumps** — `three ^0.183.1` and `@react-three/fiber 10.0.0-alpha.2` are
  already pinned. Catalog **additions** only: `@preact/signals-core`, `yoga-layout`,
  `zod`, `@pmndrs/uikit-pub-sub`, `@pmndrs/pointer-events`, `suspend-react`, `zustand`.
  After editing `pnpm-workspace.yaml`: run `pnpm sync:pack`.
- `pnpm.overrides` maps `@three-flatland/*` → `workspace:*`; verify new packages resolve
  through it.
- `pnpm sync:react` covers three-flatland/presets generated wrappers only — it does NOT
  manage uikit's hand-authored react surface; run it only if those packages' category
  indexes are touched (they should not be).
- Do not touch any `CLAUDE.md` (owned by another writer). Write no planning docs beyond
  the two owned by this effort.
- Licensing task (Phase 0): retain upstream MIT LICENSE in each forked package; add
  uikit attribution to `THIRD_PARTY_LICENSES`.

## Dependency graph / parallelization

```
P0 scaffolding ─┬─► S1 metrics ─► S2 layout ─► S3 batch ─► S4 shapes
                │                                │            │
                └─► U1 panel TSL ────────────────┤            │
                         │                       ▼            ▼
                         └──────────────► U2 text-on-slug   U3 svg-on-slug
                                                 └────┬───────┘
                                                      ▼
                                          U4 react + kits ─► V validation
```

- **Strictly serial:** S1 → S2 → S3 (metrics feed layout; layout parity fixtures gate the
  batch writer's inputs); S3 → U2 (no per-instance clip ⇒ no overflow/scroll text);
  S3 → S4 (shape batch reuses the batch-mode instance layout); S4 → U3.
- **Parallel tracks after P0:** the Slug track (S1–S4) and U1 (panel TSL) are fully
  independent. Within phases, test authoring parallels implementation.
- U4 needs U2 + U3 compiled surface; V needs everything.

---

## Phase 0 — Scaffolding + adjudicated tech debt

Tasks:

1. Vendor uikit core/react/kits(default)/icons(lucide) sources into
   `packages/uikit{,-default,-lucide}` per spec §3, imports rewritten to workspace
   names, `./react` subpath exports wired, upstream vitest specs carried over.
   Everything compiles **as-is where renderer-agnostic**; the four GLSL files and
   `loaders/ttf.ts` are stubbed behind their existing module boundaries
   (`createPanelMaterial`, `createInstancedText` seams) with `throw new Error('ported in U1/U2')`
   so the packages typecheck and the pure-logic test suites run green now.
2. Catalog additions + `pnpm sync:pack`; overrides verification; LICENSE/NOTICE +
   `THIRD_PARTY_LICENSES` entry.
3. Skia debt (adjudicated by research, folded per repo iron law):
   `SkiaCanvas.ts` `WebGLRenderTarget` → `RenderTarget` (verified drop-in: it already
   runs inside the WebGPU branch fishing out `GPUTexture`s). **D1-gated:** delete
   `getFBOId` (+ its two public re-exports) if signed off; otherwise mark `@deprecated`
   with the sign-off thread linked, and record the deferral here.

Acceptance:

- [ ] `pnpm -r typecheck && pnpm -r build` green across the workspace.
- [ ] Ported upstream specs (clone/schema/flex/allocation/color) pass in
      `packages/uikit`.
- [ ] `pnpm sync:pack` idempotent (no diff on second run); examples untouched still build.
- [ ] Skia: `RenderTarget` swap landed with skia example pair rendering unchanged
      (before/after screenshots); D1 outcome recorded (deleted or deprecated+deferred).
- [ ] No `CLAUDE.md` modified anywhere in the diff.

## Phase S1 — Slug public metrics API

Tasks: `SlugFont.getKerning(a, b)` + `SlugFont.getGlyphMetrics(codepoint)` (em units,
whitespace included, `hasOutline` flag), dispatched across runtime/baked/stack backends
like `shapeText` is today; expose glyph-id↔codepoint mapping needed by layout.

Acceptance:

- [ ] Kerning parity test: runtime vs baked backends agree on a kerned pair corpus
      (extends `baked.equivalence.test.ts` pattern); stack backend documented-degraded
      at run boundaries (existing limitation, asserted not worsened).
- [ ] `getGlyphMetrics(0x20)` / tab return advances (the `textShaper.ts:94` outline
      filter demonstrably no longer blocks caret-after-space at the metrics layer).
- [ ] No public-API removals; `pnpm --filter=@three-flatland/slug test` green.

## Phase S2 — Slug layout engine + queries (`slug/layout`, `slug/query`)

Tasks: port uikit `text/layout/{normalize,measure,positioned,types}.ts` +
`text/wrapper/*.ts` + `text/layout/query.ts` onto the S1 metrics contract (spec §6.3–6.4).
Baseline math defined from `ascender`/`descender` (risk R4). Migrate `SlugText` /
`SlugStackText` onto the engine with `measureParagraph`/`wrapLines` kept as compat
wrappers (risk R6 — if migration balloons, wrappers ship and migration becomes a
stakeholder-visible deferral item, not a silent cut).

Acceptance:

- [ ] Parity fixtures: ported layout reproduces upstream layout's line breaks, per-char
      x advances, and measure results on a stubbed metrics font (golden files generated
      from the vendored upstream implementation) for: word/break-all/nowrap ×
      normal/collapse/pre/pre-line × tabSize × letterSpacing × justify.
- [ ] Query round-trip property test: `getCaretTransformation(getCharIndex(p))` lands
      within the char cell for random layouts.
- [ ] `slug-text` example pair updated to exercise wrap modes + whitespace modes,
      both backends render (manual screenshot check recorded in PR).
- [ ] Yoga-contract note honored: measure results are stable under the
      ceil-by-PointScaleFactor rounding uikit applies (`flex/node.ts:301-314`) —
      fixture asserts idempotence at 1x/2x scale factors.

## Phase S3 — Slug batch mode (`SlugBatch`: per-instance matrix, clip, writer API)

Tasks (spec §6.5): opt-in `instanceMatrix` (duck-typed instanced mesh + dilation
Jacobian through the instance 2×2 — risk R2) and `glyphClip` (4-plane coverage mask in
`SlugMaterial` **and** `SlugStrokeMaterial`); interleaved-buffer mat4 reads;
`ensureCapacity/writeGlyph/writeRect/copyWithin/count` writer surface; per-glyph color
via writer (no shader change).

Acceptance:

- [ ] Duck-typed instancing smoke test passes on WebGPU **and** forceWebGL (risk R1
      burn-down: this is the first instanced consumer, it de-risks U1's panels too).
- [ ] AA screenshot fixtures: glyphs at 0°/37°/90° rotations + 0.5×/3× scales show no
      edge-quality regression vs the non-batched path (R2 gate). **If this gate cannot
      be met in-budget, invoke D4** (per-Text-component fallback) — explicitly, in
      writing, before proceeding to U2.
- [ ] Clip test: half-clipped glyph row renders with smooth plane edges on both
      backends; unclipped sentinel has zero visual diff vs clip-disabled material.
- [ ] Writer API: bucket-simulation test (activate/deactivate/compact via `copyWithin`)
      leaves buffer contents equal to a from-scratch rebuild.
- [ ] Existing `SlugText` unaffected (opt-in cost model): perf-sensitive tests still
      green locally.

## Phase S4 — `SlugShapeSet` / `SlugShapeBatch` / `slug/svg`

Tasks (spec §7): shape registry over growable curve/band DataTextures; SVG parse via
`SVGLoader.parse` (parser only) → `cubicToQuadratics` → `bandBuilder`; per-path fill
color capture; batch-level fill rule; `SlugShapeBatch` = `SlugBatch` over the set.

Acceptance:

- [ ] All ~1500 lucide post-fixer SVGs register without band-builder failures
      (batch script over `icons/lucide` corpus); a sampled subset (≥ 24) screenshot-matches
      the tessellated SVGLoader rendering within tolerance, both backends.
- [ ] Atlas growth test: registering shapes past initial capacity preserves previously
      registered shapes' rendering (screenshot before/after growth identical).
- [ ] Multi-path multi-color SVG renders each path's fill color per instance.
- [ ] Zero `RenderTarget` construction anywhere in the new code (grep-gate) — the
      stakeholder atlas constraint holds by construction.

## Phase U1 — uikit panel TSL port (parallel with S1–S4)

Tasks (spec §5): `panel/material/nodes.ts` (`createPanelNodeMaterial`) — coverage math
in vec4 `colorNode` alpha, `alphaTest = 0.01`, border-bend `normalNode`, aData/aClipping
interleaved mat4 reads, non-instanced uniform variant; delete `depth.ts` and all
`customDepthMaterial`/`customDistanceMaterial` wiring; `Fullscreen(renderer: Renderer)`;
un-stub the Phase-0 panel seam.

Acceptance:

- [ ] Rounded/bordered/bent-border panels visually match upstream reference screenshots
      (tolerance-diffed) on WebGPU and forceWebGL; instanced and non-instanced
      (Image/Video) variants both exercised.
- [ ] Shadow gate (research correction §2.1): a rounded panel's cast-shadow silhouette
      matches its main-pass silhouette for a directional light — **without**
      `shadowMap.transmitted` and without `castShadowNode`. Point-light shadow test run
      and its result recorded (R3): pass, or documented v1 limitation with stakeholder
      ack.
- [ ] Image/Content clipping-plane shadows (`clipShadows`) verified or documented (R3).
- [ ] `panelMaterialClass: MeshStandardNodeMaterial` (lit) renders with border bend
      responding to a moving light.
- [ ] Zero hits for `onBeforeCompile|#include|WebGLProgramParameters` in
      `packages/uikit*/src` (grep-gate for the architecture rule).

## Phase U2 — uikit text on Slug (needs S3 + U1)

Tasks (spec §8): rewrite `text/render/**` on `SlugBatch` writer; `text/cache.ts` on
`SlugFontLoader`; uikit layout/query imports point at `slug/layout` + `slug/query`;
caret/selection/hidden-input untouched except import paths; `renderSolid` → rect
sentinel; delete `loaders/ttf.ts`, `@pmndrs/msdfonts`, `@zappar/msdf-generator`;
execute D3 (default font: bake Inter weights, measure against the 1.5 MB budget, record
outcome).

Acceptance:

- [ ] Ported upstream text-dependent specs green; caret/selection/input flows work in
      the example (click-to-caret, drag-select, type/delete) — e2e scripted.
- [ ] Scroll/overflow: text inside a scrolled clipped container clips correctly on both
      backends (the S3-clip → U2 dependency proven end-to-end).
- [ ] Cross-component batching holds: N Text components sharing a font render as 1
      glyph draw call (devtools stats assert) — or D4 fallback is in force with its
      recorded authorization.
- [ ] Vertical metrics (R4): side-by-side against upstream on the same TTF shows no
      perceptible baseline shift (diff overlay in PR).
- [ ] D3 outcome recorded; default-kit text renders with no font configuration.

## Phase U3 — uikit `Svg` on `SlugShapeBatch` (needs S4 + U1)

Tasks (spec §7 last bullet): per-root shape-batch group manager (mirrors glyph groups);
`Svg` component rewrite; invisible bounds quad for pointer events; lucide + default-kit
builds consume it unchanged (generator untouched — icons pass `content` strings).

Acceptance:

- [ ] Icon wall (≥ 200 lucide icons): renders correctly, and UI draw calls ≤ 3
      (panels + glyphs + shapes) via devtools stats — the headline perf win, asserted.
- [ ] Svg `color`/`opacity` properties and multi-color SVGs behave as upstream.
- [ ] Pointer events on icons (hover/click in the kit's buttons) work via bounds quads.
- [ ] Default kit builds and its components render (visual sample in PR).

## Phase U4 — react subpath + packaging

Tasks (spec §9): port react sources against r3f `10.0.0-alpha.2` (risk R5 — divergences
forced by v10 land in the compat matrix, not silently); `./react` subpath exports for
all three packages; changeset-visibility check (packages public, not ignored).

Acceptance:

- [ ] React example (`examples/react/uikit`) runs on `@react-three/fiber/webgpu` Canvas;
      hooks/refs/event props verified for Container/Text/Input/Svg.
- [ ] Any r3f-v10-forced API changes enumerated in the spec's compat matrix (edit the
      spec in the same PR).
- [ ] `pnpm -r build` produces valid dual exports for `.` and `./react` on all three
      packages (publint or equivalent check clean).

## Phase V — validation, examples, PR readiness

Tasks: finish the example **pair** (`examples/three/uikit` + `examples/react/uikit` —
both or neither, repo rule) covering the spec §10 scene list; playwright e2e + visual
baselines into the existing harness; perf gates as local-only asserts (repo CI posture:
CI logs, local asserts); package READMEs with migration notes from `@pmndrs/uikit`;
final compat-matrix pass; upstream-diff review (every divergence from `0d4d887` maps to
a spec §11 row or a commit explaining it).

Acceptance:

- [ ] Example pair complete and green in e2e on WebGPU **and** forceWebGL.
- [ ] Full workspace: `pnpm -r typecheck`, lint, `pnpm -r test`, examples build — green.
- [ ] All perf gates pass locally; numbers recorded in the PR description.
- [ ] Compat matrix final; every "broken" row has a migration note in the README.
- [ ] D1–D4 all resolved-and-recorded (done, or stakeholder-authorized deferral quoted).
- [ ] Conventional-commit history clean (changesets will auto-generate); no hand-written
      changeset files in the diff; no `CLAUDE.md` changes.

## Standing risk watch (from spec §13)

R1 retired at S3-gate; R2 owned by S3 with D4 as the pre-negotiated exit; R3 owned by
U1's shadow gates; R4 owned by S2 fixtures + U2 visual diff; R5 owned by U4; R6 owned by
S2's wrapper strategy; R7 (Skia shaper) requires no v1 action.

# uikit fork → TSL + Slug: execution plan

**Rev 2** — folds in Q1–Q7 resolutions, phase-0 experiments E1–E4, the incremental
interop example thread, fleet serialization points, and build-system facts.
**Spec:** `planning/superpowers/specs/2026-07-10-uikit-fork-tsl-slug-design.md`
**Branch:** `feat/uikit-fork` (worktree `.claude/worktrees/uikit-fork`) — one PR.
**Sources:** uikit clone @ `0d4d887`; `three@0.183.1`; `@three-flatland/slug@0.1.0-alpha.3`.

Acceptance criteria are a hard gate in this repo: every item below is met, or carries an
explicit stakeholder-authorized deferral, before the PR is marked ready. Open decision
points D1–D4 (spec §14) must be resolved before their owning phase starts. This plan is
written for execution by a parallel agent fleet: every phase is independently
verifiable, leaves the tree green, and names its serialization points.

## Repo mechanics (apply throughout)

- Conventional Commits; releases cut from **auto-generated** changesets — never
  hand-write changesets (`.changeset/CLAUDE.md`); repo is in alpha pre-release mode.
  New packages are release-visible iff `private !== true` and not in
  `.changeset/config.json` ignore; they start public with `0.1.0-alpha.0` intent.
- Prettier: no semicolons, single quotes, trailing commas. `type` keyword on type-only
  imports (`verbatimModuleSyntax`). Unused vars prefixed `_`.
- **Lint/format is a per-phase gate, not a hook.** `lefthook.yml` pre-commit runs ONLY
  sync scripts (`sync-pack-full`, `sync-pack-files`, `sync-lockfile`,
  `sync-react-subpaths`, `sync-examples`, `check-skia-pin`) — no prettier, no eslint.
  Every phase's acceptance therefore includes `prettier --check .`, eslint, and
  `pnpm -r typecheck` explicitly. Hooks do fire from worktrees.
- **No catalog bumps** — `three ^0.183.1` and `@react-three/fiber 10.0.0-alpha.2` are
  already pinned. Catalog **additions** only: `@preact/signals-core`, `yoga-layout`,
  `zod`, `@pmndrs/uikit-pub-sub`, `@pmndrs/pointer-events`, `suspend-react`, `zustand`.
  After editing `pnpm-workspace.yaml`: run `pnpm sync:pack`.
- `pnpm.overrides` maps `@three-flatland/*` → `workspace:*`; verify the three new
  packages resolve through it.
- **React subpath decision (recorded):** `@three-flatland/uikit`'s `./react` is
  **hand-authored** (like `packages/slug/src/react.ts`). We do NOT touch
  `scripts/sync-react-subpaths.ts` or its `lefthook.yml` glob — they cover
  three-flatland/skia generated wrappers only and stay that way.
- **Sync cascade warning:** any commit touching `packages/*/package.json` or
  `pnpm-workspace.yaml` triggers `sync-pack-full` (rewrites `examples/` + `minis/`
  manifests and `git add`s them) and `sync-lockfile` (rewrites `pnpm-lock.yaml`).
  This is expected — do not revert those files; include them in the commit.
- **Constructor carve-out (fleet-critical — R8).** `@three-flatland/uikit` preserves
  `@pmndrs/uikit` constructor signatures **verbatim**, including required args like
  `Fullscreen(renderer, ...)`. Do NOT apply root `CLAUDE.md`'s no-arg convention to any
  uikit class — that rule governs classes this repo authors, and root `CLAUDE.md`
  (`37c186dc`) states the ported-package exemption. The React layer constructs through
  R3F's `args` prop (`packages/react/src/build.tsx:22-24` builds
  `args = [latestPropsRef.current, undefined, { renderContext }]`; `useSetup` stores
  `{ args }` at `build.tsx:74,84`), which is the sanctioned R3F mechanism for required
  constructor params. "Fixing" a ported constructor to no-arg is a silent public-API
  break; U1 and U4 gate this with a signature diff against upstream `.d.ts`.
- **Backend-specific TSL is authorized** (stakeholder ruling): branch at graph-build
  time on `builder.renderer.backend.isWebGPUBackend` inside `setup(builder)` — the
  pattern three itself uses (`BitcountNode.js:315-325`, `VarNode.js:236-238`), zero
  runtime cost. Q1/Q2 are therefore design choices, not blockers — and both are
  resolved with **zero branches** in v1 (vec4-lane mat4 layout; coverage-multiply clip
  with unconditional `fwidth`). Any branch added later needs a profiling result plus a
  both-backend screenshot parity pair (spec §5.5).
- Do not touch any `CLAUDE.md` (owned by another writer). Skia guidance is owned by
  PR #172 — cite it; never author `packages/skia/CLAUDE.md`.
- Licensing (spec §3.1): each forked package ships upstream MIT LICENSE with **both**
  copyright lines (Bela Bohlender 2024, Coconut Capital 2023); `THIRD_PARTY_LICENSES`
  gains the uikit entry; Slug's existing entries stay intact.

## Fleet serialization points (single-writer files)

Exactly one agent may own each of these at a time; conflicts here are the predictable
failure mode of parallel execution:

| File                                                                | Owning phase(s)                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml` (catalog) + `pnpm-lock.yaml`                  | P0 only (one commit)                                                                                          |
| `examples/_shared/gems.config.ts` + `docs/src/data/example-gems.ts` | P0 scaffolds the example registration once; later phases edit only inside `examples/{three,react}/uikit-hud/` |
| `THIRD_PARTY_LICENSES`                                              | P0                                                                                                            |
| `packages/slug/src/index.ts` (public export surface)                | one Slug-track agent at a time (S-phases are serial anyway)                                                   |
| `packages/uikit/src/index.ts`                                       | U-track                                                                                                       |
| `lefthook.yml`, `scripts/sync-react-subpaths.ts`                    | NOBODY (recorded decision above)                                                                              |

## Dependency graph / parallelization

```
P0 scaffolding + E1–E4 ─┬─► S1 metrics ─► S2 layout ─► S3 batch ─► S4 shapes
                        │                                │            │
                        └─► U1 panel TSL ────────────────┤            │
                                 │                       ▼            ▼
                                 └──────────────► U2 text-on-slug   U3 svg-on-slug
                                                         └────┬───────┘
                                                              ▼
                                                  U4 react + kits ─► V final validation
   example thread: P0 row → U1 rows → U2 rows → U3 row → U4 row   (spec §10 table)
```

- **Strictly serial:** E1–E4 gate all fan-out; S1 → S2 → S3 → S4; S3 → U2 (no
  per-instance clip ⇒ no overflow/scroll text); S4 → U3.
- **Parallel tracks after P0:** the Slug track (S1–S4) and U1 are fully independent.
  Within phases, test authoring parallels implementation.
- **The interop example is a thread, not a phase.** `examples/{three,react}/uikit-hud`
  is scaffolded in P0 and each subsequent phase lights its rows from the spec §10
  table. A row that cannot be lit means the phase did not land — treat it as a failed
  gate, not a deferrable polish item.
- U4 needs U2 + U3 compiled surface; V needs everything.

---

## Phase P0 — Scaffolding, experiments E1–E4, adjudicated tech debt

Tasks:

1. Vendor uikit core/react/kits(default)/icons(lucide) sources into
   `packages/uikit{,-default,-lucide}` per spec §3, imports rewritten to workspace
   names, `./react` subpath wired (hand-authored), upstream vitest specs carried over.
   Renderer-coupled seams (`createPanelMaterial`, `createInstancedText`,
   `loaders/ttf.ts`) stubbed behind their existing module boundaries with
   `throw new Error('ported in U1/U2')` so packages typecheck and pure-logic suites
   run green now.
2. One serialized "workspace plumbing" commit: catalog additions + `pnpm sync:pack`,
   overrides verification, LICENSE files (both copyright lines) +
   `THIRD_PARTY_LICENSES`, and expect the sync cascade (examples/minis manifests,
   lockfile) inside the same commit.
3. Example scaffold: `examples/three/uikit-hud` + `examples/react/uikit-hud` from
   `examples/{three,react}/template/`, registered in `examples/_shared/gems.config.ts`,
   `pnpm sync:examples` run (generates `gem.ts` files + `docs/src/data/example-gems.ts`),
   `package.json` per `examples/three/slug-text` + `pnpm sync:pack`. Content: the
   existing tilemap + Light2D base scene rendering alongside an empty uikit `Root`
   (spec §10 row 1).
4. **Experiments E1–E4** (spec §13.1) as standalone harness scenes/tests inside the
   example or a scratch mini, each with its recorded pass/fail:
   - E1 duck-typed instancing + vec4-lane mat4 attrs, both backends.
   - E2 `colorNode.a`+`alphaTest` shadow silhouette on an instanced duck-typed mesh;
     point-light variant recorded.
   - E3 coverage-graph compile: zero WGSL uniformity diagnostics, both backends render
     AA rounded corners within tolerance.
   - E4 yoga-layout published-TS + inlined-WASM through our vitest + example dev boot;
     fallback `noExternal: ['yoga-layout']` if it fails.
5. Skia debt (adjudicated; folded per repo iron law and the root-`CLAUDE.md`
   no-carve-out audit): `SkiaCanvas.ts` `WebGLRenderTarget` → `RenderTarget` (verified
   drop-in — the WebGPU branch fishes `GPUTexture`s out of it regardless). **D1-gated:**
   delete `getFBOId` + its two public re-exports (`three/index.ts:27`,
   `react/index.ts:43`) if signed off; otherwise mark `@deprecated` with the sign-off
   thread linked and record the deferral here.

Acceptance:

- [ ] `pnpm -r typecheck && pnpm -r build` green; `prettier --check .` + eslint green.
- [ ] Ported upstream specs (clone/schema/flex/allocation/color) pass in
      `packages/uikit`.
- [ ] E1–E4 all recorded with pass/fail + screenshots; any FAIL halts fan-out and
      escalates to the stakeholder with the measured evidence.
- [ ] Example pair scaffolded, registered in gems config, `pnpm sync:examples` and
      `pnpm sync:pack` idempotent (no diff on re-run); base scene renders on WebGPU
      and forceWebGL (spec §10 row 1 lit).
- [ ] Skia `RenderTarget` swap landed with skia example pair rendering unchanged
      (before/after screenshots); D1 outcome recorded (deleted or deprecated+deferred).
- [ ] No `CLAUDE.md`, `lefthook.yml`, or `sync-react-subpaths.ts` modifications
      anywhere in the diff.

## Phase S1 — Slug public metrics API

Tasks: `SlugFont.getKerning(a, b)` + `SlugFont.getGlyphMetrics(codepoint)` (em units,
whitespace included, `hasOutline` flag), dispatched across runtime/baked/stack backends
like `shapeText` is today; glyph-id↔codepoint mapping exposed for layout. Exported from
the package index, documented in the Slug README (public API, not uikit helpers —
spec §6 mandate).

Acceptance:

- [ ] Kerning parity test: runtime vs baked agree on a kerned-pair corpus (extends
      `baked.equivalence.test.ts`); stack backend documented-degraded at run
      boundaries (existing limitation, asserted not worsened).
- [ ] `getGlyphMetrics(0x20)` / tab return advances — the `textShaper.ts:94` outline
      filter demonstrably no longer blocks caret-after-space at the metrics layer.
- [ ] No public-API removals; `pnpm --filter=@three-flatland/slug test` green;
      prettier/eslint/typecheck green.

## Phase S2 — Slug layout engine + queries (`slug/layout`, `slug/query`)

Tasks: port uikit `text/layout/{normalize,measure,positioned,types}.ts` +
`text/wrapper/*.ts` + `text/layout/query.ts` onto the S1 metrics contract
(spec §6.3–6.4). Baseline math defined from `ascender`/`descender` (risk R4). Migrate
`SlugText`/`SlugStackText` onto the engine; `measureParagraph`/`wrapLines` remain as
compat wrappers (risk R6 — if migration balloons, wrappers ship and the migration
becomes a stakeholder-visible deferral item, never a silent cut). All of it public,
tested, documented independent of uikit.

Acceptance:

- [ ] Parity fixtures: ported layout reproduces upstream's line breaks, per-char x
      advances, and measure results on a stubbed metrics font (goldens generated from
      the vendored upstream implementation) for word/break-all/nowrap ×
      normal/collapse/pre/pre-line × tabSize × letterSpacing × justify.
- [ ] Query round-trip property test: `getCaretTransformation(getCharIndex(p))` lands
      within the char cell for randomized layouts.
- [ ] Measure results stable under uikit's ceil-by-PointScaleFactor rounding
      (`flex/node.ts:301-314` contract) at 1x/2x scale factors.
- [ ] `slug-text` example pair updated to exercise wrap + whitespace modes, both
      backends (screenshots recorded).
- [ ] Slug suite green; prettier/eslint/typecheck green.

## Phase S3 — Slug batch mode (`SlugBatch`: per-instance matrix, clip, writer API)

Tasks (spec §6.5): opt-in `instanceMatrix` (duck-typed instanced mesh + dilation
Jacobian through the instance 2×2 — risk R2) and `glyphClip` (4-plane coverage-multiply
mask per Q2/Q4 in **both** `SlugMaterial` and `SlugStrokeMaterial`); vec4-lane mat4
reads (Q1); `ensureCapacity/writeGlyph/writeRect/copyWithin/count` writer surface;
per-glyph color via writer (no shader change). Zero backend branches (spec §5.5).

Acceptance:

- [ ] AA screenshot fixtures: glyphs at 0°/37°/90° rotations + 0.5×/3× scales show no
      edge-quality regression vs the non-batched path, both backends (R2 gate).
      **If unmeetable in budget, invoke D4 in writing before U2 proceeds.**
- [ ] Clip: half-clipped glyph row renders smooth plane edges on both backends;
      the unclipped sentinel has zero visual diff vs clip-disabled material; no WGSL
      uniformity diagnostics (Q2 restructure holds).
- [ ] Writer API bucket-simulation test (activate/deactivate/compact via `copyWithin`)
      equals a from-scratch rebuild.
- [ ] Existing `SlugText` unaffected (opt-in cost model) — its tests and perf
      characteristics unchanged.
- [ ] Slug suite green; prettier/eslint/typecheck green.

## Phase S4 — `SlugShapeSet` / `SlugShapeBatch` / `slug/svg`

Tasks (spec §7): shape registry over growable curve/band DataTextures; SVG parse via
`SVGLoader.parse` (parser only) → **adaptive** `cubicToQuadratics` (same converter,
recursion until deviation < 0.25% of viewBox diagonal, depth-capped — F2 caveat) →
`bandBuilder`; per-path fill color capture; batch-level fill rule;
`SlugShapeBatch` = `SlugBatch` over the set.

Acceptance:

- [ ] All lucide post-fixer SVGs register without band-builder failures (batch script
      over the corpus); a sampled subset (≥ 24) screenshot-matches tessellated
      SVGLoader rendering within tolerance, both backends.
- [ ] Adaptive-split error-bound unit test: max deviation of emitted quadratics vs
      source cubics under the tolerance on a high-curvature corpus.
- [ ] Atlas growth preserves previously registered shapes (before/after screenshots
      identical).
- [ ] Multi-path multi-color SVG renders per-instance fill colors.
- [ ] Grep-gate: zero `RenderTarget` construction in the new code — the
      no-render-target rule holds by construction.
- [ ] Slug suite green; prettier/eslint/typecheck green.

## Phase U1 — uikit panel TSL port (parallel with S1–S4)

Tasks (spec §5): `panel/material/nodes.ts` (`createPanelNodeMaterial`) — coverage in
vec4 `colorNode` alpha, `alphaTest = 0.01`, border-bend `normalNode`, vec4-lane mat4
reads for aData/aClipping, non-instanced uniform variant, Q2-safe derivative ordering;
delete `depth.ts` and all `customDepthMaterial`/`customDistanceMaterial` wiring;
`Fullscreen(renderer: Renderer)` type widening **with the signature kept verbatim
(spec §9.1 — do NOT normalize constructors)**; un-stub the P0 panel seam. Light the
example's U1 rows: Fullscreen HUD, lit world-space shadow-casting panel, transparent
UI over sprites.

Acceptance:

- [ ] Rounded/bordered/bent-border panels match upstream reference screenshots
      (tolerance-diffed) on WebGPU and forceWebGL; instanced and non-instanced
      (Image/Video) variants exercised.
- [ ] Shadow gate: rounded panel's cast silhouette matches main-pass silhouette for a
      directional light — **without** `shadowMap.transmitted`, without
      `castShadowNode`. Point-light result recorded (R3): pass, or documented v1
      limitation with stakeholder ack. Image/Content `clipShadows` verified or
      documented (R3).
- [ ] `panelMaterialClass: MeshStandardNodeMaterial` renders with border bend
      responding to a moving light.
- [ ] Example rows 2–4 lit (HUD, shadow panel, transparent-over-sprites) on both
      backends.
- [ ] Grep-gates: zero `onBeforeCompile|#include|WebGLProgramParameters` in
      `packages/uikit*/src`; zero constructor-signature diffs vs upstream `.d.ts`
      for exported classes (R8 check).
- [ ] Suites green; prettier/eslint/typecheck green.

## Phase U2 — uikit text on Slug (needs S3 + U1)

Tasks (spec §8): rewrite `text/render/**` on the `SlugBatch` writer; `text/cache.ts`
on `SlugFontLoader`; uikit imports point at `slug/layout` + `slug/query`;
caret/selection/hidden-input untouched except import paths; `renderSolid` → rect
sentinel; delete `loaders/ttf.ts`, `@pmndrs/msdfonts`, `@zappar/msdf-generator` — **no
MSDF path survives anywhere** (spec §8.1); execute D3 (bake Inter, measure the 1.5 MB
budget, record). Light the example's U2 rows: zoomable text, scroll-container quest
log.

Acceptance:

- [ ] Ported upstream text-dependent specs green; caret/selection/input flows scripted
      in e2e (click-to-caret, drag-select, type/delete).
- [ ] Scroll/overflow: text in a scrolled clipped container clips correctly on both
      backends (S3-clip → U2 proven end-to-end); example row 6 lit.
- [ ] Cross-component batching holds: N Text components sharing a font = 1 glyph draw
      (devtools stats assert) — or D4 fallback in force with recorded authorization.
- [ ] Vertical metrics (R4): side-by-side vs upstream on the same TTF shows no
      perceptible baseline shift (diff overlay in PR); example row 5 (zoomable text)
      lit.
- [ ] Grep-gate: zero `msdf|distanceRange|@pmndrs/msdfonts|@zappar` hits in
      `packages/uikit*/`.
- [ ] D3 outcome recorded; default kit text renders with zero font configuration.
- [ ] Suites green; prettier/eslint/typecheck green.

## Phase U3 — uikit `Svg` on `SlugShapeBatch` (needs S4 + U1)

Tasks (spec §7): per-root shape-batch group manager (mirrors glyph groups); `Svg`
component rewrite; invisible bounds quad for pointer events; lucide + default-kit
builds consume it unchanged (generator untouched — icons pass `content` strings).
Light the example's U3 row: lucide icons in the HUD.

Acceptance:

- [ ] Icon wall (≥ 200 lucide icons) renders correctly at ≤ 3 UI draw calls
      (panels + glyphs + shapes) via devtools stats; example row 7 lit.
- [ ] Svg `color`/`opacity` and multi-color SVGs behave as upstream.
- [ ] Pointer events on icons (kit buttons hover/click) work via bounds quads.
- [ ] Default kit builds; visual sample in PR.
- [ ] Suites green; prettier/eslint/typecheck green.

## Phase U4 — react subpath + packaging (needs U2 + U3)

Tasks (spec §9): port react sources against r3f `10.0.0-alpha.2` (Q7 verified
`extend()`/`args` survive; residual drift is R5 — divergences land in the spec §11
matrix, never silently); `./react` subpaths on all three packages (hand-authored);
changeset-visibility check (public, not ignored). Light the example's U4 row: the
React twin.

Acceptance:

- [ ] `examples/react/uikit-hud` runs on the `@react-three/fiber/webgpu` Canvas with
      all rows mirrored from the three example; hooks/refs/event props verified for
      Container/Text/Input/Svg; example row 8 lit.
- [ ] Constructor signatures still verbatim-upstream (R8 re-check after react port).
- [ ] Any r3f-v10-forced changes enumerated in spec §11 (edit the spec in-PR).
- [ ] `pnpm -r build` produces valid dual exports for `.` and `./react` on all three
      packages (publint or equivalent clean).
- [ ] Suites green; prettier/eslint/typecheck green.

## Phase V — final validation and PR readiness

Tasks: finish the example pair's polish + docs page
`docs/src/content/docs/examples/uikit-hud.mdx` (guide page optional; `slug-text` is
the template); playwright e2e + visual baselines in the existing harness; perf gates as
local-only asserts (repo CI posture: CI logs, local asserts); package READMEs with the
migration section (incl. the §8.1 MSDF rationale verbatim); final compat-matrix pass;
upstream-diff review — every divergence from `0d4d887` maps to a spec §11 row or a
commit explaining it.

Acceptance:

- [ ] All 8 example-table rows lit; e2e green on WebGPU **and** forceWebGL.
- [ ] Full workspace: `pnpm -r typecheck`, `prettier --check .`, eslint,
      `pnpm -r test`, examples build — green.
- [ ] Docs example page exists and renders; gems registration + `sync:examples` +
      `sync:pack` all idempotent.
- [ ] Perf gates pass locally; numbers in the PR description.
- [ ] Compat matrix final; every "broken" row has a README migration note.
- [ ] D1–D4 all resolved-and-recorded (done, or stakeholder-authorized deferral
      quoted verbatim).
- [ ] Conventional-commit history clean (changesets auto-generate); no hand-written
      changesets; no `CLAUDE.md`/`lefthook.yml`/sync-script changes in the diff.

## Standing risk watch (spec §13)

E1–E4 retire the statically-unprovable set in P0, before fan-out. R1 retired by E1;
R2 owned by S3 with D4 as the pre-negotiated exit; R3 owned by E2 + U1's shadow gates;
R4 owned by S2 fixtures + U2 visual diff; R5 owned by U4; R6 owned by S2's wrapper
strategy; R7 requires no v1 action (Skia untouched; guidance owned by PR #172);
R8 owned by the spec §9.1 carve-out + U1/U4 signature-diff gates; R9 owned by S4's
error-bound test.

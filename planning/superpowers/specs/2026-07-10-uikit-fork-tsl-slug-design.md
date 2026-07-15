# uikit fork → TSL + Slug: design spec

**Date:** 2026-07-10 (rev 5 — delivery shape decided: stacked PR train, tip-green
gate, ordered one-sitting merge (runbook in the plan); turbo.json carve-out debt
folded in. Rev 4: D3 FINAL — `uikit-bake` bin, slug baker-contract debt,
`SlugShapeSet` serialization in v1. Rev 3 folded the D1–D4 rulings. Rev 2 folded
Q1–Q7, licensing, backend-branch authorization, the interop example, and build-system
mechanics.)
**Status:** D1–D4 ruled (§14); one open decision (D5, default font residence)
**Verified against:** pmndrs/uikit @ `0d4d887` (clone), `three@0.183.1` (node_modules
source), `@three-flatland/slug@0.1.0-alpha.3` (workspace),
`@react-three/fiber@10.0.0-alpha.2` (installed), `yoga-layout@3.2.1` (registry)
**Companion plan:** `planning/superpowers/plans/uikit-fork-tsl-slug-execution.md`
**Authoritative sibling docs (read, do not duplicate):** root `CLAUDE.md` (architecture
rule + ported-package constructor exemption), `packages/slug/CLAUDE.md` (Slug internals,
gaps, licensing constraint). Skia guidance is owned by PR #172 — cite, don't author.

## 1. Goal

Fork `pmndrs/uikit` into `@three-flatland/uikit`, ported to TSL node materials
(WebGPU + WebGL2 via the common `Renderer`'s two backends — one shader graph, WGSL and
GLSL ES 3.0; never the legacy `WebGLRenderer`). Replace its MSDF text renderer with
`@three-flatland/slug`, and in the process migrate uikit's proven text layout engine
_into_ Slug so Slug becomes a complete standalone text engine. Route SVG rendering
through a new Slug shape batch (analytic, instanced, zero render targets). Delivered
as **one landing**: a stacked PR train based on `feat/uikit-fork`, held until the tip
is green and merged to `main` in one ordered sitting (runbook in the plan) — proven by
uikit's use of Slug **and by a required three-flatland interop example** (§10).

Binding stakeholder decisions (not relitigated here):

1. WebGPU + WebGL2 via TSL; no GLSL, no legacy WebGLRenderer. **Backend-specific TSL
   paths are explicitly authorized** where a single graph can't serve both backends —
   branch at build time on `builder.renderer.backend.isWebGPUBackend`, the pattern three
   itself uses (`BitcountNode.js:315-325`, `VarNode.js:236-238`); zero runtime cost.
   Use sparingly; a single shared graph is always preferred (§5.5).
2. uikit's text layout code migrates INTO Slug; uikit consumes Slug. **The Slug uplift
   is mandatory deliverable scope** — every gap it closes lands as first-class public
   API in `@three-flatland/slug`, exported, tested, and documented for consumers who
   never touch uikit (§6). uikit is the proof, not the container.
3. `@pmndrs/uikit` public API preserved where possible; only natural upgrades forced by
   three/r3f/WebGPU; further divergence must be argued explicitly (§11). This includes
   **constructor signatures** — see §9.1.
4. SVG ships in v1 through Slug. Skia is a v2 escape hatch only, never on the hot path,
   never one render target per element (now also a root-`CLAUDE.md` rule).
5. One **landing**, on the `feat/uikit-fork` worktree — amended from "one PR" with
   stakeholder direction (_"…ensure there is a runbook for how to merge it all
   cleanly without re-work"_): a stacked PR train (five reviewable layers), nothing
   merges until the tip is green, then the whole train merges in one ordered sitting
   and the release is cut once, after — so no Slug API publishes before uikit proves
   it. Full runbook in the plan.
6. **MSDF is deleted, not kept as a fallback.** Slug replaces MSDF entirely — this is
   THE sanctioned divergence from upstream (§8.1).

## 2. Corrections to the prior research (design-relevant)

Second-pass verification confirmed nearly all of the research packet (LOC counts, the 4
GLSL files, the fullscreen type-widening, TSL slot line numbers, the text render/layout
seam, the Slug gaps, the SVG mesh-forest, the Skia RenderTarget verdicts). These
findings **changed the design**:

1. **`depth.ts` is not "collapsed by `castShadowNode`" — it is already dead under the
   new renderer, and `castShadowNode` is the wrong replacement.**
   `customDepthMaterial` / `customDistanceMaterial` are referenced _nowhere_ in
   `three/src/renderers/common/` or the shadow node system — the common Renderer
   ignores them entirely. And `castShadowNode` requires the global
   `renderer.shadowMap.transmitted = true` flag (warns otherwise,
   `renderers/common/Renderer.js:3150-3155`) — an app-wide behavioral change we must
   not impose. The correct mechanism: `Renderer._getShadowNodes()`
   (`Renderer.js:3124-3222`) **automatically multiplies `material.colorNode.a` into the
   shadow alpha** and honors `material.alphaTest` in the shadow pass. So: put the full
   panel coverage (rounded corners × opacity × per-instance clip) into the alpha of a
   vec4 `colorNode`, set `alphaTest`, and rounded-corner shadows are correct with zero
   extra materials, zero renderer flags. `depth.ts` is deleted, not ported. This
   supersedes Q3's `castShadowNode` framing; the residual Q3 sub-question (per-instance
   attributes available in the shadow pass) is experiment E2 (§13.1).

2. **`opacityNode` is invisible to the shadow path.** `_getShadowNodes` reads only
   `colorNode.a`, `map`, `castShadowNode`, and `maskNode`. An `opacityNode + Discard()`
   mapping would silently break shadow correctness. Coverage alpha lives in
   `colorNode`; the manual `discard` is replaced by `alphaTest` (applied in both
   passes).

3. **No catalog version bumps are needed.** `pnpm-workspace.yaml` already pins
   `@react-three/fiber: 10.0.0-alpha.2` (deliberately, with a canary-breakage comment)
   and `three: ^0.183.1`. The fork _adds_ catalog entries for new dependencies but
   bumps nothing.

4. **uikit already accepts TTF fonts** via `src/loaders/ttf.ts` (runtime MSDF
   generation through `@zappar/msdf-generator`; upstream ships `ttf-vanilla` /
   `ttf-react` examples). The "font format break" is narrower than claimed: TTF/OTF
   URLs keep working (natively and better under Slug); what breaks is precompiled
   MSDF-JSON sources and the `@pmndrs/msdfonts` defaults (§8.1).

Two load-bearing facts the research missed:

- **uikit's instancing is duck-typed.** `InstancedPanelMesh extends Mesh` with
  `isInstancedMesh = true` and `instanceMatrix: InstancedBufferAttribute(…, 16)`
  (`panel/instance/mesh.ts:7-14`). The common renderer's guards are
  `object.isInstancedMesh && object.instanceMatrix?.isInstancedBufferAttribute`
  (`NodeMaterial.js:832`; `RenderObject.js:783`) — the duck type passes them, but this
  is the port's single most load-bearing instancing assumption → experiment E1.
- **TSL has no native mat4 vertex attribute** — see Q1 below.

### 2b. Resolved uncertainties Q1–Q7

**Q1 — mat4 instanced attributes (RESOLVED, no experiment needed).** Neither WGSL nor
TSL's attribute system has matrix vertex attributes. three itself lowers
`instanceMatrix` to **4 × vec4 lanes** over an `InstancedInterleavedBuffer` and
recomposes `mat4(lane0, lane1, lane2, lane3)` in the node graph — on _both_ backends
(`nodes/accessors/InstanceNode.js`, `_createInstanceMatrixNode`:
`bufferFn(interleaved,'vec4',16,0|4|8|12)` → `mat4(...)`). The fork normalizes **all**
mat4-shaped instance data (`aData`, `aClipping`, Slug's `glyphClip` and per-instance
transform) to this vec4-lane layout on both backends. No backend branch: one layout,
one code path, proven by three's own instancing and by Slug's existing 5×vec4 design.

**Q2 — `fwidth` after non-uniform `discard` (RESOLVED, restructure + E3 compile
check).** TSL's `Discard()` emits a raw `discard` expression on both builders
(`nodes/utils/Discard.js:13`). In WGSL, `discard` has demote-to-helper semantics, so a
_top-level_ conditional discard followed by derivative calls is actually valid; the
real WGSL hazard is a derivative call _lexically inside non-uniform control flow_
(uniformity analysis error). The design eliminates the question entirely: **all
`fwidth` calls execute unconditionally**, clipping folds into a coverage multiply
(uikit's per-iteration `discard` at `shader.ts:121` / `instanced-glyph-material.ts:66`
becomes `coverage *= smoothstep(...)`), and the single discard is NodeMaterial's
`alphaTest`, emitted after `colorNode` evaluation — i.e. after every derivative. Valid
on both backends, no branch. If profiling later shows heavily-clipped fragments cost
WebGL2 measurably (lost early-out), the authorized per-backend split is: early
`Discard()` in the GLSL graph, coverage-multiply in the WGSL graph — a build-time
`isWebGPUBackend` branch. That is an optimization with a profiling gate, not v1 scope.
Experiment E3 (phase 0) compiles the panel graph on both backends and fails on any
WGSL uniformity diagnostic.

**Q3 — shadow pass on instanced meshes.** Superseded by correction #1 (no
`castShadowNode` anywhere in the design). Residual: the shadow override material is
compiled per RenderObject against the object's geometry, and `NodeMaterial.setup`
runs the instancing path off `builder.object.isInstancedMesh` — so per-instance
attributes _should_ be available in the shadow pass. Not statically provable →
experiment E2 with a silhouette pass/fail.

**Q4 — per-instance clip cost vs batch granularity (RESOLVED: per-instance planes).**
Numbers: 4 planes = 16 floats = **64 B/instance**; a heavy UI at 10 000 glyphs costs
640 KB of GPU attribute memory — noise. Writes are `DynamicDrawUsage` +
`addUpdateRange`, and clip data only changes on layout/scroll-container mutation, not
per scrolled frame (scrolling moves glyph transforms, not the container's planes).
The alternative — batch per `(font, clipRect)` with a uniform clip — costs one draw
call per scroll container per font, forces rebatching (sorted-bucket buffer moves)
whenever a rect resizes or a container mounts, and breaks uikit's allocator model.
A vec4 screen-AABB is insufficient regardless: a world-space UI's clip rect is an
arbitrary transformed quad (ancestors rotate via `transformRotateX/Y/Z`), which is
exactly why uikit uses 4 arbitrary plane equations. Verdict: per-instance mat4 planes,
uikit parity, vec4-lane layout per Q1.

**Q5 — render order under WebGPURenderer (RESOLVED, parity confirmed).** The common
renderer sorts by `groupOrder` → `renderOrder` → depth → id
(`renderers/common/RenderList.js:12-58`), and its **default transparent sort is
literally `reversePainterSortStable`** (`RenderList.js:364-366`) — the same function
uikit exports and asks users to install. `setOpaqueSort` / `setTransparentSort` exist
on the common Renderer (`Renderer.js:1915,1927`), so uikit's documented setup carries
over verbatim. `order.ts` + `OrderInfo` + sorted buckets port unchanged. Residual
visual confirmation rides the interop example's transparent-UI-over-sprites scene
(§10) rather than a dedicated experiment.

**Q6 — yoga-layout WASM (RESOLVED with E4 gate).** `yoga-layout@3.2.1` publishes
**raw TypeScript** (`main`/`exports` → `./src/index.ts`, `./load` → `./src/load.ts`)
with the WASM binary base64-inlined — no `.wasm` asset fetch, no `three.Loader`
involvement (the repo loader convention is not implicated; yoga is a build-time
dependency, not an asset loader). uikit imports `yoga-layout/load` (async init) and
already owns the async-init flow. Consequence for us: consumers' bundlers must compile
yoga's TS. Vite/esbuild dep-optimization handles TS dependencies and upstream uikit
ships this exact arrangement to Vite users today — precedent, not speculation. Design:
keep yoga as a regular externalized dependency in the tsup build (matching upstream);
if our vitest/tsup pipeline chokes on the TS source, the fallback is
`noExternal: ['yoga-layout']` (bundle it). Experiment E4 (phase 0): package tests +
example dev-server boot exercise yoga end-to-end; pass = flex specs green and example
renders a laid-out container on both backends.

**Q7 — r3f alpha + `/webgpu` (RESOLVED statically; drift check in U4).**
`@react-three/fiber@10.0.0-alpha.2` is installed in this workspace with exports
`.` / `./legacy` / `./webgpu`. `extend()` survives in v10, and uikit's React layer
registers vanilla classes exactly that way (`build.tsx:14
extend({ ['Vanilla' + name]: Component })`; `index.tsx:102,153`) and constructs via
the **`args` prop** (`build.tsx:22-24` → `useSetup` stores `{ args }`,
`build.tsx:74,84`). Library hooks import from the base `@react-three/fiber` entry;
examples' `Canvas` imports from `@react-three/fiber/webgpu` per repo rule. Remaining
drift risk (R5) is bounded to the 693-LOC react package and resolved during U4.

## 3. Package layout

New workspace packages (all follow the repo's `/react` subpath convention — a single
package per unit, React surface under `./react`, not a separate `@react-three/*` fork):

```
packages/uikit/                      @three-flatland/uikit
  LICENSE                            upstream MIT, BOTH copyright lines (§3.1)
  src/                               forked core (from packages/uikit/src upstream)
    panel/material/nodes.ts          NEW — TSL panel material (replaces shader.ts, create.ts)
    panel/material/depth.ts          DELETED
    text/render/**                   REWRITTEN — Slug-backed glyph groups
    text/layout/** text/wrapper/**   DELETED here — migrated into @three-flatland/slug (§6)
    text/cache.ts text/font.ts       REWRITTEN — SlugFontLoader-backed cache; MSDF Font dies
    loaders/ttf.ts                   DELETED — TTF is native via Slug
    components/svg.ts                REWRITTEN — SlugShapeBatch-backed (§7)
    components/fullscreen.ts         renderer: Renderer (type widening only)
    react/                           forked from upstream packages/react/src — HAND-AUTHORED
                                     subpath (like packages/slug/src/react.ts); we do NOT
                                     extend scripts/sync-react-subpaths.ts or its lefthook
                                     glob (recorded decision — see plan "Build-system facts")
  package.json                       exports: ".", "./react" (+ internals as upstream)
packages/uikit-lucide/               @three-flatland/uikit-lucide  (generated icons + ./react)
packages/uikit-default/              @three-flatland/uikit-default (kit core + ./react)
packages/uikit-horizon/              @three-flatland/uikit-horizon (kit core + ./react)
```

Kept as npm dependencies (unchanged upstream, renderer-agnostic — fork nothing we don't
change): `@pmndrs/uikit-pub-sub`, `@pmndrs/pointer-events`, `@preact/signals-core`,
`yoga-layout`, `zod`, `suspend-react`, `zustand`.

Dropped dependencies: `@pmndrs/msdfonts`, `@zappar/msdf-generator` (MSDF-only — §8.1).

**Build graph:** `turbo.json`'s global `build.dependsOn` chains every package without
a per-package carve-out behind `@three-flatland/skia#build` (a WASM compile). Every
new uikit package ships with a
`"<pkg>#build": { "dependsOn": ["^build"], "outputs": ["dist/**"] }` carve-out, and
`@three-flatland/slug`'s **missing** carve-out (pre-existing debt, now on uikit's
critical build path) is fixed in this PR under the iron law.

**Both kits ship in v1 — they are the conformance suite** (D2 ruling, overriding the
earlier defer-horizon recommendation; stakeholder: _"needed to ensure it works
correctly against the original"_). The kits are not surface area to minimize: `default`
and `horizon` together exercise the panel material, text, `Svg`/icons, scroll
containers, and input across a real component library, and — because the same kit tree
runs on upstream `@pmndrs/uikit` — they can be visually diffed against the original.
That is the strongest correctness signal available and costs no bespoke test authoring.
See §12 (kit-conformance harness) and risk R10.

### 3.1 Licensing and attribution

Verified facts (team-lead audit): every upstream LICENSE is verbatim MIT. The root
LICENSE carries **two** copyright holders — "Copyright 2024 Bela Bohlender" **and**
"Copyright 2023 Coconut Capital" — while per-package LICENSEs (uikit, react, msdfonts,
lucide core/react, kits default/horizon core/react) are MIT under Bela Bohlender 2024.
The Horizon kit is not encumbered by Horizon UI's commercial terms.

Where the notices live in the fork:

- Each forked package (`packages/uikit`, `packages/uikit-lucide`,
  `packages/uikit-default`, `packages/uikit-horizon`) ships a `LICENSE` retaining
  **both** upstream copyright lines plus ours, and a README "Forked from
  pmndrs/uikit @ 0d4d887" attribution block.
- Repo-level `THIRD_PARTY_LICENSES` gains a uikit entry (both copyright holders,
  upstream URL, commit). The existing Slug entries (Lengyel patent dedicated to the
  public domain 2026-03-17; reference shaders MIT) are load-bearing per
  `packages/slug/CLAUDE.md` and must remain intact through the Slug uplift.

## 4. What is forked / rewritten / deleted (uikit core, 93 files / 9,998 LOC)

- **Forked verbatim (~85% of files):** yoga flex integration, `@preact/signals-core`
  properties/schema system, `scroll.ts`, `order.ts`, `clipping.ts`,
  `allocation/sorted-buckets.ts`, event system, all components except `svg.ts` and the
  text render internals, kits/icons generators, vanilla + react component classes,
  upstream vitest specs (`tests/*.spec.ts` — clone, schema, flex, allocation, color…).
- **Rewritten:** `panel/material/{shader,create}.ts` → one TSL module; `text/render/**`
  (5 files) → Slug-backed; `text/cache.ts` (drops the 1-atlas-page assert at
  `cache.ts:33-54`); `components/svg.ts` (§7).
- **Deleted:** `panel/material/depth.ts` (+ `customDepthMaterial`/`customDistanceMaterial`
  wiring in `panel/instance/mesh.ts` and `components/image.ts`), `loaders/ttf.ts`,
  `text/font.ts` (MSDF `Font`), `text/layout/**` + `text/wrapper/**`
  (migrated into Slug, re-exported for API compat where public).

## 5. TSL panel material design

### 5.1 `createPanelNodeMaterial`

```ts
type NodeMaterialClass = { new (): NodeMaterial }
function createPanelNodeMaterial<T extends NodeMaterialClass>(
  MaterialClass: T,
  info: PanelMaterialInfo // { type: 'instanced' } | { type: 'normal'; data: Float32Array }
): InstanceType<T>
```

Same call shape as upstream `createPanelMaterial` (`panel/material/create.ts:12`), but
takes NodeMaterial classes. Default `panelMaterialClass` becomes `MeshBasicNodeMaterial`;
users may pass `MeshStandardNodeMaterial`, `MeshPhysicalNodeMaterial`,
`MeshPhongNodeMaterial`, `MeshLambertNodeMaterial`, `MeshToonNodeMaterial` (all ship in
three). Material flags preserved from upstream: `side: FrontSide`, `transparent: true`,
`toneMapped: false`, `shadowSide: FrontSide`, `clipShadows: true` — plus
`alphaTest ≈ 0.01` replacing the manual `discard` (§2.1/§2.2/Q2).

### 5.2 Per-instance data plumbing (Q1 layout)

Upstream packs per-panel state into two mat4 instanced attributes
(`aData` — border sizes / background rgb+a / packed border radius / border rgb / border
opacity / bend / dimensions; `aClipping` — 4 plane equations), plus the duck-typed
`instanceMatrix` (§2). The fork keeps the exact same Float32Arrays, buckets, and
`copyWithin` allocation machinery (`allocation/sorted-buckets.ts` untouched) and changes
only how shaders read them:

- `aData` / `aClipping` arrays wrap in `InstancedInterleavedBuffer(array, 16)` and are
  read as `mat4(instancedDynamicBufferAttribute(buf,'vec4',16,0), …4, …8, …12)` — the
  identical vec4-lane mechanism three uses for `instanceMatrix` (Q1). Same layout on
  both backends; no branch.
- `instanceMatrix` stays on the duck-typed mesh, consumed by three's own instancing
  path (guards verified §2; runtime confirmation is E1).
- Root-space positions for the clip test:
  `localPosition = varying(ourInstanceMatrixNode * positionGeometry)` — reading the
  attribute directly rather than relying on `positionLocal` mutation order after
  `InstanceNode.setup()`. Deterministic regardless of node-graph evaluation order.
- Non-instanced variant (`type: 'normal'`, used by Image/Video/custom content panels):
  a `uniform('mat4')` refreshed from `info.data` via the node update hook (upstream
  re-uploads the uniform every frame anyway).

Border radius stays packed as one float (base-50 packed int, values < 2^24 so exact in
f32); unpacking ports to TSL `floor`/`mod` arithmetic.

### 5.3 Node-slot mapping

| upstream GLSL injection (shader.ts)                                                                                                                  | TSL                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fragment prelude + `#include <clipping_planes_fragment>` replacement: corner SDF, border weights, 4-plane instanced clip loop with in-loop `discard` | one `Fn()` computing coverage; **all `fwidth` unconditional, clip = coverage multiply, no in-graph discard** (Q2); 4-corner selection as an `If`/`ElseIf` chain whose branches contain no derivative calls (corner distances computed before branching)                    |
| `#include <color_fragment>` injection: writes `diffuseColor.rgb/.a`                                                                                  | `material.colorNode = vec4(mix(mix(mainColor, borderColor, borderMix), mainColor, transition), outOpacity)` — **alpha carries full coverage** so `_getShadowNodes` sees it (§2.1)                                                                                          |
| `if (outOpacity < 0.01) discard`                                                                                                                     | `material.alphaTest = 0.01` (applies in main + shadow passes, emitted after all derivatives — Q2-safe)                                                                                                                                                                     |
| `#include <normal_fragment_maps>` injection: border-bend normal                                                                                      | `material.normalNode` — bent view-space normal from `tangentView`/`bitangentView` (panel geometry keeps its constant `tangent` attribute, `panel/geometry.ts`); no-op for unlit MeshBasicNodeMaterial; note `transformedNormalView` is deprecated r177+ (use `normalView`) |
| `PanelDepthMaterial` / `PanelDistanceMaterial` (depth.ts)                                                                                            | **deleted** — `colorNode.a` + `alphaTest` give correct shadow silhouettes through `_getShadowNodes` (§2.1)                                                                                                                                                                 |

### 5.4 `Fullscreen`

`constructor(renderer: Renderer, …)` — typed against the common `Renderer` base
(`three/webgpu`). The only members used are `getSize()` (`Renderer.js:1854`) and
`xr.getSession()` (`Renderer.js:701` — `XRManager`). Pure type widening, zero logic
change (verified: `components/fullscreen.ts:86,92,101`). The required-first-arg
constructor is **kept verbatim** — see §9.1.

### 5.5 Backend-branch policy

Authorized (§1.1) but budgeted: v1 ships **zero** backend branches. Q1 needs none (one
vec4-lane layout), Q2 needs none (coverage-multiply is valid on both). The one
pre-identified candidate — GLSL early-discard on heavily-clipped fragments — requires a
profiling result before it may be introduced, and lives behind
`builder.renderer.backend.isWebGPUBackend` in `setup()` if it ever lands. Every branch
added later must ship with a same-scene both-backend screenshot pair proving visual
parity.

## 6. The Slug uplift (mandatory deliverable scope)

Every feature in this section is **first-class public `@three-flatland/slug` API** —
exported from the package index, unit-tested, documented in the package README, and
usable by a consumer who has never heard of uikit. None of it may land as private
helpers inside `packages/uikit`. The gap list below matches `packages/slug/CLAUDE.md`
"Known gaps" one-for-one; this PR closes: per-instance clipping, public kerning,
per-instance color exposure, whitespace in measurement output, real wrapping,
hit-test/caret/selection queries, and `SlugShapeBatch` (#37). Explicit non-goals
(unchanged from both parents — neither regresses): GSUB/ligatures, bidi, complex
scripts, astral-plane correctness, UAX-14, cross-font kerning at stack run boundaries.

### 6.1 The uikit ↔ Slug boundary

**Slug owns everything that is a pure function of (font, string, constraints), plus the
GPU encoding of glyph/shape instances:**

- font parsing + metrics (existing) **+ new public metric APIs** (§6.2)
- text normalization (whitespace collapse modes, `tabSize`) — ported from
  uikit `text/layout/normalize.ts:28-56`
- wrapping — `word`, `break-all`, `nowrap` wrappers ported from `text/wrapper/*.ts`
- glyph layout build + measure — ported from `text/layout/{measure,positioned}.ts`
- layout queries: hit-test char index, caret transform, selection rects — ported from
  `text/layout/query.ts` (§6.4)
- instance encoding: attribute layout, per-glyph write/copy primitives, rect-sentinel
  solids, per-instance transform/clip/color (§6.5)
- shape batching for SVG (§7)

**uikit keeps everything that touches its scene graph, reactivity, or z-order:**

- signals/properties plumbing and the yoga `measureFunc` adapter
  (`text/layout/measure.ts:17 computedCustomLayouting` → `flex/node.ts:301-314`,
  including the PointScaleFactor ceil-rounding contract — preserved bit-for-bit to
  avoid layout jitter)
- glyph allocation & ordering: sorted buckets, `OrderInfo` major/minor indices,
  `renderOrder`, `root.requestRender()` pings
- caret & selection **rendering** (instanced panels — rounded corners and theme colors
  ride the panel pipeline; Slug supplies only their geometry via queries)
- the hidden DOM input (`text/input/hidden-input.ts`)
- clip-rect computation (scroll/overflow) — uikit computes the 4 root-space planes;
  Slug consumes them as per-instance data

Justification, and the test the boundary must pass: **a non-uikit consumer of
`@three-flatland/slug` gets a genuinely better text engine out of this PR** — layout,
measure, wrap, whitespace, kerning, caret/selection/hit-test geometry, per-instance
clip/color, and shape batching, with zero uikit imports. What stays behind is exactly
the set that is meaningless without a retained-mode UI scene graph. Caret/selection
rendering stays in uikit because panels already render them with border radius and
theme colors — Slug's rect sentinel could draw them, but would duplicate a weaker
version of the panel pipeline for zero API gain.

### 6.2 New public font/metrics API

```ts
// SlugFont (dispatches to runtime/baked/stack backends like shapeText does today)
getKerning(glyphIdA: number, glyphIdB: number): number          // em units
getGlyphMetrics(codepoint: number): SlugGlyphMetrics | undefined
// { glyphId, advanceWidth, bounds, hasOutline } — em units; whitespace included
```

- Kerning data already exists in both backends (`baked.ts:310 kernLookup`, opentype
  `getKerningValue`) — this makes it public and backend-dispatched.
- `getGlyphMetrics` must return entries for outline-less glyphs (space, tab): today
  `pipeline/textShaper.ts:94` filters them out of shaped output, which makes
  caret-after-space impossible. The ported layout engine (§6.3) does its own placement
  from these metrics — mirroring how uikit layout uses `Font.getGlyphInfo`
  (`text/font.ts:283-298`) — fixing the gap at the source.
- No `lineGap` is added (fonts vary; unreliable) — line height remains a layout input
  defaulting to `ascender - descender`, parallel to uikit's CSS-property approach.
  Baseline math is defined from `ascender` (Slug) rather than MSDF's baked-into-`yoffset`
  convention; the layout port owns this conversion (risk R4).

### 6.3 Layout engine (`slug/layout`)

Direct port of uikit's layout with the font contract swapped:

```ts
type SlugGlyphLayoutProperties = {
  text: string; font: SlugFont; fontSize: number; letterSpacing: number
  lineHeight: number | `${number}%`; wordBreak: 'keep-all' | 'break-all' | 'break-word'
  whiteSpace: 'normal' | 'collapse' | 'pre' | 'pre-line'; tabSize: number
}
measureGlyphLayout(props, availableWidth?): { width, height, lineCount }
buildGlyphLayout(props, width, height, fitInside): SlugGlyphLayout   // per-line glyph runs with x positions
```

Types mirror upstream `text/layout/types.ts` (`GlyphLayout`, `PositionedGlyphLayout`,
lines carry `charIndexOffset`, `nonWhitespaceCharCount`, per-char x advances) so
uikit-side consumers (caret, selection, justify) port mechanically. Kerning applied via
`getKerning` on glyph-id pairs. Existing `SlugText` / `SlugStackText` migrate onto this
engine (replacing `pipeline/wrapLines.ts`'s ASCII-space-only wrapper) — this migration
is how the "complete text engine" claim is proven outside uikit. `measureParagraph` and
`wrapLines` remain as thin compatibility wrappers.

### 6.4 Queries (`slug/query`)

Ports of `text/layout/query.ts` operating on `SlugGlyphLayout`:
`getCharIndex(layout, x, y, 'between' | 'on')`, `getCaretTransformation(layout, charIndex)`,
`getSelectionTransformations(layout, start, end)` — returning the same
`CaretTransformation` / `SelectionTransformation` shapes uikit's selection/caret/input
files consume today (verified those consume only this module — `text/selection/*.ts`,
`text/input/hidden-input.ts`).

### 6.5 Batch-mode rendering (`SlugBatch`)

The core rendering uplift. Requirements derived from uikit's glyph pipeline
(`text/render/instanced-glyph*.ts`):

1. **Cross-component batching is REQUIRED v1 scope** (D4 ruling — the fallback is
   withdrawn). What this actually is, stated plainly because it is easy to mistake for
   MSDF legacy: `SlugText extends InstancedMesh` — today Slug renders **one mesh per
   text component**, so every glyph in that mesh shares the mesh's single transform.
   `glyphJac` carries the inverse Jacobian, which `slugDilate` uses to expand each quad
   by half a pixel **in screen space** (`SlugMaterial.ts:142-151`) and to map the pixel
   footprint back into em space for analytic coverage. With one uniform transform that
   Jacobian is trivially correct — which is why Slug looks crisp today. uikit batches
   glyphs from **many components** into one instanced mesh keyed by `Font`
   (`instanced-glyph-group.ts:11,41`); those components carry heterogeneous transforms
   (different `pixelSize`, ancestor rotations via `transformRotateX/Y/Z`, non-uniform
   scale), so each **instance** needs its own transform matrix, and the Jacobian must
   be derived **per instance** from that matrix rather than from the mesh. Get it wrong
   and glyphs go blurry or fat at odd transforms. This is a feature Slug is missing,
   not MSDF baggage — exactly the "if this is a required feature that slug is missing
   we add it" case. Without it, text regresses to one draw call per `Text` node against
   uikit's one-draw-per-font model; a kit dashboard easily holds 100+ Text nodes and
   "minimize draw calls" is a repo constraint.
2. Therefore `SlugBatch` extends the instance layout (existing 5 × vec4 —
   `glyphPos/glyphTex/glyphJac/glyphBand/glyphColor` — kept intact, extended exactly as
   `packages/slug/CLAUDE.md` prescribes: new `InstancedBufferAttribute`s in the
   constructor and `_grow`) with two opt-in attribute groups, each vec4-lane mat4 (Q1):
   - `instanceMatrix` (mat4) — per-glyph transform; the batch mesh duck-types
     `isInstancedMesh` exactly like uikit panels so three's InstanceNode handles
     position/normal, and Slug's dilation math extends to fold the instance 2×2 upper
     block into its pixel-per-em Jacobian (SlugMaterial currently passes MVP rows as
     per-object uniforms; the instance matrix composes in the vertex stage). Highest-
     risk shader change in the project (risk R2) — **if S3 genuinely stalls, that is an
     escalation to the stakeholder, not a silent exit; there is no per-Text-mesh
     fallback.**
   - `glyphClip` (mat4 = 4 root-space plane equations, per Q4) — coverage-multiply mask
     (Q2-safe: unconditional `fwidth`, no in-graph discard) added to **both**
     `SlugMaterial` and `SlugStrokeMaterial`. Gates `overflow: hidden` and scroll
     containers; blocks uikit text integration until landed.
3. **Allocator-compatible writer API**, so uikit's sorted-bucket machinery drives Slug
   buffers directly (mirrors `InstancedGlyph.activate/updateColor/updateClippingRect`
   against MSDF attributes today):

   ```ts
   class SlugBatch /* duck-typed instanced Mesh over SlugGeometry-compatible buffers */ {
     ensureCapacity(n: number): void // grow-by-1.5×, copyWithin-preserving
     writeGlyph(i, glyphId, font, opts): void // opts: matrix, color, clip
     writeRect(i, rect, opts): void // rect sentinel (glyphJac.w < 0) — replaces
     // MSDF renderSolid AND serves underline/strikethrough
     copyWithin(target, start, end): void // bucket compaction
     count: number
   }
   ```

   Per-glyph color (attr exists; shader already multiplies it in,
   `SlugMaterial.ts:258-263`) is exposed through `writeGlyph` — zero shader work, as
   the audit predicted.

4. `SlugText` (standalone) keeps the cheap path: no instance matrices, no clip attrs —
   both attribute groups are constructor-opt-in so existing users pay nothing.

## 7. SVG: `SlugShapeSet` + `SlugShapeBatch`

Roadmap item #37 (`slug/README.md:185`), pulled into v1.

- **`SlugShapeSet`** — "a font whose glyphs are SVG paths." Maintains the same
  curve/band `DataTexture` pair `SlugFont` exposes (`curveTexture`/`bandTexture`),
  built incrementally: `registerShape(contours: QuadContour[]) → ShapeHandle`
  (bounds + bandLocation, i.e. the `SlugGlyphData` shape). Growth reallocates the
  DataTextures from CPU-side arrays (registration-time only). **This is the "texture
  atlas approach": data textures of curve control points. Zero render targets exist
  anywhere in this pipeline** — the stakeholder constraint (now a root-`CLAUDE.md`
  rule) is satisfied by construction, and Skia is not involved in v1 at all.
- **`slug/svg` parser** — `parseSVG(svgText): { shapes, fills }` using three's
  `SVGLoader.parse` **as a parser only** (no `createShapes` tessellation): flatten
  transforms, convert each subpath's curves to quadratics, hand contours to the
  existing `bandBuilder`. Captures per-path fill color and fill-rule. v1 supports
  fills only: the lucide pipeline runs `oslllo-svg-fixer` at build time
  (`icons/lucide/convert.ts:2`), converting all strokes to closed filled paths, so
  icons are pure fills by construction. Fill-rule is batch-level v1 (`evenOdd` exists
  on SlugMaterial; post-fixer lucide output is nonzero); per-shape fill-rule is a
  documented v2 item.
- **Cubic conversion (F2, verified with a caveat):** `cubicToQuadratics`
  (`pipeline/fontParser.ts:273-320`) is a **fixed, non-adaptive** single t=0.5
  De Casteljau split emitting exactly 2 quadratics — no recursion, no error metric.
  Adequate for em-normalized glyph outlines; **not** guaranteed for arbitrary SVG
  cubics rendered at icon-wall scale (long high-curvature segments will visibly
  deviate). Design: `slug/svg` wraps the _same_ converter in adaptive recursion —
  split while the max deviation between the cubic and its quadratic approximation
  exceeds a tolerance relative to the shape's viewBox (default 0.25% of the diagonal),
  with a depth cap. One converter, parameterized — honoring `packages/slug/CLAUDE.md`'s
  "do not write a second converter." Lines become degenerate quadratics
  (control point at midpoint).
- **`SlugShapeBatch`** = `SlugBatch` over a `SlugShapeSet` — identical instance layout
  (per-instance matrix, color, clip), one draw call for any number of shape instances.
- **`SlugShapeSet` serialization** (D3-final scope — `uikit-bake icons` needs it, §8.3):
  a baked shape-set container reusing slug's existing GLB packing infrastructure
  (`glb.ts`, the `.slug.glb` pattern) — registered shapes' curve/band tables + bounds +
  handles serialized once at bake time, loaded without any SVG parsing or band
  building at runtime. Acceptance identity: a baked set renders pixel-identically to
  the same SVGs registered at runtime.
- **uikit `Svg` component**: replaces the mesh-forest
  (`components/svg.ts:106-117` — one `Mesh` + one `MeshBasicMaterial` per shape per
  path) with instances in a per-root shape-batch group, managed exactly like glyph
  groups (OrderInfo, buckets, requestRender). One SVG with N fill paths → N instances
  sharing a transform. Public `SvgProperties` (src/content/color/opacity) unchanged.
  Interaction: the batch is non-raycastable (like `InstancedPanelMesh.raycast(): void`),
  so `Svg` keeps an invisible bounds quad for pointer events — matching panel-bounds
  interaction semantics. Result for an icon wall: hundreds-to-thousands of draws today
  → 1 draw + bounds proxies.

## 8. uikit text integration (rewritten `text/render/**`)

### 8.1 MSDF is deleted — the one sanctioned divergence

There is **no dual-path text renderer**. Concretely: `text/render/**` (5 files) is
replaced by the Slug-backed renderer; `text/font.ts`'s MSDF `Font` class dies — its
layout-metric _contract_ (`getGlyphInfo` em-unit fields + `getKerning`) survives as the
`SlugFont` metrics API (§6.2), while its render fields (`uvX/uvY/uvWidth/uvHeight`,
`page`, `pageWidth/pageHeight`, `distanceRange`, `renderSolid`) die with it
(`renderSolid`'s job is taken by the rect sentinel); `text/cache.ts`'s `loadFont` (one
atlas page + page image assert) is rewritten on `SlugFontLoader` (a
`three.Loader<SlugFont>` — conforms to this repo's loader architecture);
`loaders/ttf.ts` and the `@pmndrs/msdfonts` / `@zappar/msdf-generator` dependencies are
dropped.

In the compat matrix this is the one _intentional_ break, and the rationale belongs in
the README verbatim: **an MSDF atlas has a fixed resolution ceiling; a world-space UI
you can walk up to — or a HUD at arbitrary DPI — has none. Slug evaluates the glyph's
actual Bézier curves analytically per fragment, so one font tree is exact at every
scale.** That is why the break is worth making, and it is the sentence a pmndrs
maintainer needs to read.

### 8.2 Integration mechanics

- Glyph groups keyed by `SlugFont` (was `Font`), one `SlugBatch` per
  (font × material-class × root), preserving `OrderInfo`/`renderOrder` integration and
  `root.requestRender()` pings.
- `InstancedGlyph` writes through `SlugBatch.writeGlyph/writeRect`.
- `FontFamilies` property shape preserved (family → weight → URL); URL targets change
  from MSDF JSON to TTF/OTF (runtime shaper) or `.slug.glb` (baked).
- **Fonts: runtime is the default path** (D3 ruling — no pre-baked font ships).
  `SlugFontLoader` parses TTF/OTF and builds curve/band textures at runtime; no
  `.slug.glb` in the package, no size budget, no Unicode-subset decision forced on
  users. This composes with §2.4 — uikit users already pass TTF URLs. **Baking is an
  opt-in optimization** (faster startup, no opentype.js parse), surfaced through the
  CLI (§8.3), never a prerequisite. What remains open is only where the default
  Inter _source_ TTFs live so `Text` keeps upstream's zero-config UX (upstream bundled
  `@pmndrs/msdfonts` assets) — that is decision **D5** (§14): bundle the static TTFs
  for the weights the kits use vs resolve from a pinned CDN URL vs require explicit
  `fontFamilies`. Recommend bundling (parity with upstream's bundled defaults; TTFs
  are source assets, not pre-baked artifacts, so the D3 ruling is respected).

### 8.3 Baking tooling (D3 final ruling: uikit gets its own bin)

Stakeholder principle, applied literally: _"uikit can be used standalone, so it gets a
bin… slug surfaces its own bake, so should uikit, even if it just proxies it to slug."_
**Each package surfaces its own tooling; a consumer of one package must never need to
learn its dependencies' CLIs.**

**Target convention (stated so the fleet doesn't guess):** every baking package
**must** register with `flatland-bake` via `flatland.bake` in its package.json
(discoverability — the registry pattern the repo built); a **standalone bin is
additionally warranted** when the package is commonly used on its own (slug, uikit).
Under this convention `alphamap` (`alpha`) and `normals` (`normal`) are already
conformant — registration, no bin needed; slug and uikit get both.

**Fold-in tech debt (iron law — slug violates the documented contract today):**
`bake/src/types.ts:4-16` requires entry modules to default-export a
`Baker { name, description, run(args): Promise<number>, usage?() }`, and its canonical
example is literally `{ "name": "font", "description": "Bake SlugFont", "entry":
"./dist/cli.js" }`; `flatland-bake`'s USAGE names `@three-flatland/slug` as the
expected provider. But `slug/src/cli.ts` has **zero exports** (a bare bin script) and
slug's package.json has **no `flatland.bake` field** — so `flatland-bake --list` omits
it and the documented example is false. Fix in this PR:

1. Refactor `slug/src/cli.ts` to `export default baker` following
   `alphamap/src/cli.ts:35` (`name: 'font'` — making the `types.ts` canonical example
   true; `description`, `usage()`, `run(args): Promise<number>`).
2. Keep the `slug-bake` bin as a thin wrapper calling `baker.run(process.argv.slice(2))`.
3. Add `flatland.bake: [{ "name": "font", … }]` to `packages/slug/package.json`.

This also gives uikit a **callable exported function to proxy** — no subprocess
spawning.

**uikit's tooling:**

- Bin **`uikit-bake`** (follows the `<pkg>-bake` precedent: `flatland-bake`,
  `slug-bake`), plus a `flatland.bake` registration under baker name **`uikit`** so it
  appears in `flatland-bake --list`. **Collision check:** `discoverBakers()` warns on
  duplicate names — slug owns `font`, so uikit's baker is `uikit` with subcommands,
  never a second top-level `font`.
- Two subcommands, one CLI: `uikit-bake font <ttf...>` (proxies slug's exported
  `baker.run` with kit-aware weight/range defaults) and `uikit-bake icons <svg-dir>`
  (bakes an SVG set into a serialized `SlugShapeSet` — see §7; requires the S4
  serialization format). `flatland-bake uikit font|icons …` dispatches to the same
  implementation.

## 9. React surface

Upstream `packages/react` sources move to `packages/uikit/src/react`, exported via the
`./react` subpath (repo convention). **Hand-authored** subpath, like
`packages/slug/src/react.ts` — uikit's react layer is 693 LOC of real React
(forwardRef, `useSetup`, portals, `build()`), not mechanical re-exports; the
`sync-react-subpaths` script and its lefthook glob are left untouched. Peer deps:
`@react-three/fiber` per catalog pin `10.0.0-alpha.2`, `react ^19`. Hooks import from
the base fiber entry; examples' `Canvas` from `@react-three/fiber/webgpu` (Q7).

### 9.1 Constructor-signature carve-out (READ THIS, implementing agents)

**`@three-flatland/uikit` preserves `@pmndrs/uikit`'s constructor signatures verbatim.**
`Fullscreen(renderer, properties?, initialClasses?, config?)` keeps its **required**
first argument. Do not make `renderer` optional, do not add a property setter for it,
do not invent a no-arg shape — for any uikit class.

Why this is correct in R3F: uikit's React layer never relies on no-arg construction.
It passes constructor arguments through R3F's **`args` prop** — the sanctioned
mechanism: `packages/react/src/build.tsx:22-24` builds
`args = [latestPropsRef.current, undefined, { renderContext }]`, `useSetup` stores
`outPropsRef.current = { args }` (`build.tsx:74,84`), and `args` is spread onto the
`extend()`-registered element. Required constructor params are fully legal R3F.

The root `CLAUDE.md` rule ("optional constructor params, property setters,
array-compatible setters") governs classes **this repo authors** — it is an ergonomic
convention, not an R3F requirement, and root `CLAUDE.md` now states the ported-package
exemption explicitly. Stakeholder ruling, verbatim: _"The uikit compatibility decision
overrides the constructor arg decision, it works fine in r3f, we keep their convention
for uikit."_ An agent "helpfully" normalizing a ported constructor to no-arg is
breaking public API compatibility — this is named risk R8, and this subsection is its
mitigation.

## 10. The required three-flatland interop example

Stakeholder requirement: a uikit example on the examples page and in the docs that
**interops with three-flatland** — "it has to interop with three-flatland for us to
make it all make sense." A standalone uikit demo does not qualify.

**Scene (adopting the team-lead proposal, with one correction):** a game HUD plus an
in-world panel over an existing three-flatland tilemap scene lit by `Light2D` effects.
The correction: **`Light2D` cannot literally light a uikit panel.** Light2D is a
MaterialEffect in three-flatland's sprite/effect-material pipeline, not a scene-graph
light — it does not illuminate arbitrary three meshes (and layers don't isolate lights
per-object in WebGPU anyway). The world-space panel instead uses
`panelMaterialClass: MeshStandardNodeMaterial` lit by a standard three light
(e.g. a PointLight color/position-matched to the scene's Light2D torch), which is the
honest interop story: same renderer, same frame, same visual language. Bridging
flatland LightEffects into panel materials is a named v2 idea, not v1 scope.

The example's real function is **integration acceptance test** — each phase lights one
row, and a row that cannot be lit means the phase did not land:

| Example feature                                                    | Risk/uncertainty it retires                                                | Lands with phase |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------- |
| Tilemap + Light2D base scene renders alongside an empty uikit Root | E1 duck-typed instancing, renderer co-existence                            | P0               |
| `Fullscreen` HUD (score/health/FPS)                                | `pixelSize` mapping, `Renderer.getSize()` widening, §9.1 args construction | U1               |
| World-space panel, `MeshStandardNodeMaterial`, casting a shadow    | panel TSL port, shadow-via-`colorNode.a` (E2)                              | U1               |
| Transparent UI over sprites                                        | Q5 render order under the common renderer                                  | U1               |
| Zoomable text on the world panel                                   | Slug resolution independence vs the MSDF it replaces                       | U2               |
| Scroll container (quest log)                                       | Q4/per-instance clipping — the hardest Slug gap                            | U2               |
| lucide icons in the HUD                                            | `SlugShapeBatch`, zero-render-target constraint, F2 adaptive cubics        | U3               |
| React twin of all of the above                                     | Q7 r3f alpha `/webgpu`, `extend`/`args`                                    | U4               |

Conventions (all hard requirements — see plan "Build-system facts"): example **pair**
`examples/three/uikit-hud/` + `examples/react/uikit-hud/` scaffolded from
`examples/{three,react}/template/`; registered in `examples/_shared/gems.config.ts`
followed by `pnpm sync:examples` (regenerates per-example `gem.ts` +
`docs/src/data/example-gems.ts`); `package.json` modeled on
`examples/three/slug-text/package.json` + `pnpm sync:pack`; docs page
`docs/src/content/docs/examples/uikit-hud.mdx` (guide page optional, `slug-text` is the
template).

## 11. API compatibility matrix vs `@pmndrs/uikit`

**Preserved (verbatim):** all component classes, their properties, **and their
constructor signatures** (§9.1) — Container, Content, Custom, Image, Input, Root, Svg,
Text, Textarea, Video, Fullscreen; the properties/classes/signals system (zod schemas,
conditional props, `md`/`hover` etc.); yoga flexbox layout incl. `measureFunc` rounding;
scroll/overflow semantics; event system (`@pmndrs/pointer-events`);
`reversePainterSortStable` (and it is now the common renderer's _default_ transparent
sort — Q5); `CaretTransformation`/`SelectionTransformation` types; kits/icons component
APIs; `FontFamilies` property shape; TTF font URLs (§2.4).

**Naturally upgraded (forced by three/WebGPU/r3f):**

| API                                                           | upstream                                   | fork                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `panelMaterialClass`                                          | `Material` classes (Basic/Phong/Physical…) | `NodeMaterial` classes (`Mesh*NodeMaterial`); default `MeshBasicNodeMaterial`             |
| `GlassMaterial` / `MetalMaterial` / `PlasticMaterial` aliases | WebGL material classes                     | corresponding NodeMaterial classes                                                        |
| `Fullscreen(renderer)`                                        | `WebGLRenderer`                            | `Renderer` (common base; WebGPURenderer incl. forceWebGL) — signature otherwise identical |
| react peer                                                    | `@react-three/fiber >= 8`                  | `10.0.0-alpha.2` (catalog pin)                                                            |
| three peer                                                    | `>= 0.162`                                 | `>= 0.183` (common-renderer maturity; NodeMaterial slot surface)                          |

**Broken (enumerated, each argued):**

1. Legacy `WebGLRenderer` support — removed by architecture decision 1. WebGL 2
   remains supported through the common Renderer's `forceWebGL` backend.
2. **The MSDF pipeline, entirely** (§8.1) — precompiled MSDF-JSON sources,
   `@pmndrs/msdfonts` defaults, runtime MSDF generation (`convertFontToJson`,
   `@zappar/msdf-generator`). The deliberate enhancement; rationale in §8.1.
3. Internals that leak GLSL: `PanelDepthMaterial`, `PanelDistanceMaterial`,
   `compilePanelMaterial`, `MaterialClass` type. Anyone monkey-patching shaders was
   renderer-coupled by definition.
4. Package identity: `@react-three/uikit` → `@three-flatland/uikit/react` (repo
   subpath convention; keeping upstream's npm names would be squatting). Import-path
   migration is mechanical and documented in the README.
5. Caret/selection visuals unchanged in API but not guaranteed pixel-identical (font
   metrics source changed from MSDF atlas metrics to real font tables).

## 12. Testing strategy

- **Ported suites:** upstream `tests/*.spec.ts` run unchanged against the fork
  (renderer-agnostic: clone/schema/flex/allocation/color). They gate the "still uikit"
  claim.
- **Slug unit tests** (vitest, alongside the existing suites): kerning API across all
  three backends; `getGlyphMetrics` incl. whitespace; layout-port parity fixtures —
  golden outputs generated by running upstream's layout (MIT, vendored pre-rewrite)
  against a stubbed metrics font, asserting the Slug port reproduces line breaks,
  per-char x positions, and measure results; query round-trips; baked-vs-runtime
  layout equivalence (extends `baked.equivalence.test.ts`); adaptive
  cubic-to-quadratic error bound test (F2).
- **Phase-0 experiments E1–E4** (§13.1) with hard pass/fail — everything not statically
  provable runs before dependent work fans out.
- **Renderer smoke tests (both backends):** duck-typed instancing renders (panel +
  SlugBatch); per-instance clip planes clip; rounded-panel shadow silhouette matches
  its main-pass silhouette (E2); point-light shadow recorded pass-or-documented.
- **Kit-conformance harness (D2 — the kits ARE the conformance suite):** a fixture app
  renders the same `default` and `horizon` kit trees twice — upstream `@pmndrs/uikit`
  (+ kits, pinned to `0d4d887`-era npm releases) on `WebGLRenderer`, and the fork on
  `WebGPURenderer` — and screenshot-diffs them with tolerance. Text regions get a
  looser tolerance band or masking (MSDF vs Slug rasterization legitimately differs at
  the pixel level); layout boxes, panel geometry/radius/borders, icon shapes, and
  scroll behavior must match. This is the primary "works correctly against the
  original" signal and costs no bespoke test authoring.
- **e2e/visual (playwright, existing harness):** the `uikit-hud` example pair — panels,
  scrolled clipped text, selection + caret, icon wall, transparent-over-sprites
  ordering, dark/light.
- **Perf gates (local-only asserts per repo CI posture):** icon wall (200 icons) ≤ 3
  UI draw calls (panels + glyphs + shapes) via devtools stats; no steady-state
  per-frame allocation.
- **Formatting/lint are explicit per-phase gates** — the repo's pre-commit hook runs
  only sync scripts (no prettier, no eslint), so every phase's acceptance includes
  `prettier --check` + eslint + `pnpm -r typecheck`. "Hooks will catch it" is false.

## 13. Risk register

### 13.1 Phase-0 experiments (unverifiable statically — hard pass/fail)

| #   | Experiment                                                                                                                                     | Pass criterion                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Duck-typed `isInstancedMesh` mesh (Mesh subclass + `instanceMatrix` attr + count) with a NodeMaterial reading interleaved vec4-lane mat4 attrs | Renders N distinct instances on WebGPU **and** forceWebGL; no warnings; instance update via `addUpdateRange` visible next frame                                        |
| E2  | Rounded-corner coverage in `colorNode.a` + `alphaTest` on an instanced duck-typed mesh, casting shadows                                        | Directional-light shadow silhouette matches main-pass silhouette (screenshot diff); per-instance attrs readable in shadow pass; point-light variant recorded pass/fail |
| E3  | Panel coverage graph (unconditional `fwidth`, coverage-multiply clip, `If/ElseIf` corners) compiled on both backends                           | Compiles clean — zero WGSL uniformity diagnostics, zero GLSL warnings; renders AA'd rounded corners identically (tolerance diff)                                       |
| E4  | `packages/uikit` vitest (flex specs exercising yoga's published TS + inlined WASM) + example dev boot                                          | Flex specs green under our vitest; example renders a yoga-laid-out container on both backends; else flip to `noExternal: ['yoga-layout']` and re-run                   |

### 13.2 Standing risks

| #   | Risk                                                                                                                     | Exposure                                                             | Mitigation                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Duck-typed instancing breaks beyond the verified guards                                                                  | Panels + text + shapes                                               | E1 before fan-out; fallback: real `InstancedMesh` subclass with shims                                                                                                                        |
| R2  | Per-instance matrix × Slug dilation Jacobian — hardest shader change; errors show as blurry/fat glyphs at odd transforms | Cross-component text batching (REQUIRED v1 — D4 ruling, no fallback) | AA screenshot fixtures at rotations, **non-uniform scales, and mixed `pixelSize`** (where per-instance Jacobian errors surface); a stall is a stakeholder escalation, not an exit            |
| R3  | Point-light (distance) shadows and ClippingContext/`clipShadows` in shadow passes not fully verifiable from source       | Image/panel shadows in lit scenes                                    | E2 records it; if broken upstream in three, scope v1 shadows to directional/spot with documented limitation                                                                                  |
| R4  | MSDF-baseline vs Slug-ascender metric conversion shifts text vertically                                                  | Every Text node                                                      | Baseline math defined once in `slug/layout`; parity fixtures assert line boxes; visual diff vs upstream on the same TTF                                                                      |
| R5  | r3f `10.0.0-alpha.2` drift vs upstream react code written for r8/r9                                                      | 693-LOC react package                                                | Q7 verified `extend`/`args` survive; port phase isolates the rest; divergences land in §11, never silently                                                                                   |
| R6  | SlugText/SlugStackText migration onto the new layout engine balloons                                                     | Slug phase                                                           | Compat wrappers ship regardless; migration is its own gated phase                                                                                                                            |
| R7  | Unverified prior claim (accepted, not re-proven): Skia's compiled shaper is primitive-only                               | None in v1 — Slug is the only text engine                            | Re-verify only if the v2 Skia escape hatch is exercised; Skia guidance owned by PR #172                                                                                                      |
| R8  | An implementing agent "fixes" a ported constructor to no-arg per the repo convention, silently breaking API compat       | Every uikit class; fleet execution amplifies it                      | §9.1 carve-out (mirrored in root `CLAUDE.md`); U-phase acceptance includes a signature-diff check against upstream `.d.ts`                                                                   |
| R9  | Fixed t=0.5 cubic split too coarse for SVG at scale (F2 caveat)                                                          | Icon rendering fidelity                                              | Adaptive recursion in `slug/svg` (§7) with an error-bound unit test; lucide corpus screenshot sampling                                                                                       |
| R10 | Horizon kit doubles the kit port surface in v1 (D2 ruling)                                                               | Schedule; U3/U4/V volume                                             | Kits are renderer-agnostic component code consuming core primitives — port cost is mechanical; the kit-conformance harness (§12) catches drift; kit-track work parallelizes across the fleet |

## 14. Stakeholder decisions — rulings recorded (D1–D4) + open (D5)

- **D1 — RULED: delete `getFBOId`.** Remove the function and both public exports
  (`skia/src/ts/three/index.ts:27`, `skia/src/ts/react/index.ts:43`), plus the
  `SkiaCanvas` `WebGLRenderTarget → RenderTarget` swap. Breaking-change commit marker.
  **Coordination hazard:** `packages/skia` source is also in PR #172's orbit (that PR
  owns `packages/skia/CLAUDE.md` — different files, no direct conflict), so the skia
  edits land in **their own commit**, independently cherry-pickable/revertable if #172
  merges first.
- **D2 — RULED (overrides the defer recommendation): port BOTH kits in v1.**
  Stakeholder: _"needed to ensure it works correctly against the original."_ The kits
  are the conformance suite (§3, §12, R10).
- **D3 — RULED, FINAL (two rounds): no pre-baked default font; uikit gets its OWN
  bin.** Runtime `SlugFontLoader` is the default path; baking is opt-in. Final ruling
  on tooling shape: _"uikit can be used standalone, so it gets a bin… even if it just
  proxies it to slug"_ — so `uikit-bake` (bin) + `flatland-bake` registration both
  ship (§8.3), the slug baker-contract debt (zero exports, missing registration) is
  folded in per the iron law, baker names are `font` (slug) and `uikit` (uikit) to
  avoid the `discoverBakers()` collision warning, and `uikit-bake icons` pulls
  `SlugShapeSet` serialization into v1 scope (§7). The 1.5 MB bake budget question
  remains dissolved.
- **D4 — RULED (withdraws the fallback): cross-component batching is required v1
  scope.** R2 is a missing Slug feature (per-instance transform + per-instance
  Jacobian), not MSDF legacy — see the §6.5 explanation. S3 acceptance strengthened
  (rotations, non-uniform scales, mixed `pixelSize`); a genuine stall escalates to the
  stakeholder.
- **D5 — OPEN (spawned by the D3 ruling): where do the default Inter _source_ TTFs
  live?** Upstream bundles its default fonts (`@pmndrs/msdfonts`), so zero-config
  `Text` is part of the preserved UX. Options: (a) bundle static Inter TTFs for the
  weights the kits use (~300 KB/weight, runtime-parsed — not pre-baked, so consistent
  with D3); (b) resolve defaults from a pinned CDN URL (zero package weight, adds a
  network dependency + supply-chain surface); (c) require explicit `fontFamilies`
  (API/UX break with upstream). **Recommend (a)**, weights measured during U2.
  _Needs ruling before U2._

# SVG bake pipeline — evidence brief (for the Fable Planner)

**Goal (stakeholder, verbatim intent):** "The full SVG pipeline just like the slug pipeline — the offline bake, the glb, the whole thing." Icons/SVGs should have a first-class **offline bake → packed `.glb` shape tables → loader-with-backends** path that mirrors slug's *font* pipeline, and (the motivating win) a **shared shape set so icons batch into ~1 draw call instead of 26**.

## The motivating measurement (live, retina, uikit-bento)

- `drawCalls: 32`, `triangles: 1859`. Panels already batch: **65 panels → 1 draw** (`InstancedPanelMesh`). 831 glyphs → 2 draws.
- **26 of the 32 draws are `InstancedShapeMesh` — one per icon.** That is the whole draw-call tail.
- GPU is fill-bound, not draw-bound (steady-state ~2–4ms at retina), so this is a **draw-count / CPU-overhead / scalability** win and an **architecture-parity** win, NOT a GPU-ms win. Say so honestly in the plan; do not oversell frame-time.

## Why it's 26 draws (root cause, with anchors)

- Icons render through slug's shape path: `InstancedShapeMesh extends SlugShapeBatch` over a `SlugShapeSet` — `packages/uikit/src/svg/render/instanced-shape-group.ts:24`.
- Batching **is already implemented** and keys groups by **`SlugShapeSet` first**, then `[majorIndex,minorIndex,depthTest,depthWrite,renderOrder]` — `ShapeGroupManager.getGroup(...)` at `instanced-shape-group.ts:96-129`. Same shape-set + same order-band ⇒ one draw.
- But each icon carries its **own** `SlugShapeSet`: `createInstancedShapes` groups by `svg.set` — `packages/uikit/src/svg/render/instanced-shapes.ts:43-49`. Each `RegisteredSVG` (`{ set, handles, fills }`) is a distinct set ⇒ distinct group ⇒ distinct draw ⇒ 26.
- **The infra to batch already exists — the sets just aren't shared.** A shared/atlassed `SlugShapeSet` across icons collapses them to ~1 draw per render-order band.

## The slug FONT pipeline to MIRROR (study these)

- `packages/slug/src/SlugFontLoader.ts` — binds a backend at load (runtime / baked / stack) onto `SlugFont._backend`.
- Backends: `pipeline/textShaper.ts` (runtime, opentype.js), `pipeline/textShaperBaked.ts` (`.slug.glb` packed tables), `pipeline/textShaperStack.ts` (fallback chain).
- Bake + format + container: `bake.ts`, `format.ts`, `glb.ts`, `baked.ts`, and the CLI `packages/slug/src/cli.ts` (Unicode-range subsetting). `slug/CLAUDE.md` documents the baked↔runtime equivalence contract (guard: `baked.equivalence.test.ts`).

## SVG pipeline TODAY (what exists vs the gap)

- **Runtime parse exists:** `packages/slug/src/svg/parseSVG.ts`, `loadSVG.ts` (`registerSVG(set, parsedSVG) → RegisteredSVG`, `loadSVGShapes`), lucide-tested (`parseSVG.lucide.test.ts`). Cubic→quadratic via `pipeline/fontParser.ts`'s `cubicToQuadratics` (reuse — do NOT write a second converter, per `slug/CLAUDE.md`).
- **`SlugShapeSet`** (`packages/slug/src/SlugShapeSet.ts`): `registerShape(contours) → handle`, growable, packs curve/band textures. This is the shared-atlas primitive.
- **PARTIAL shape-bake infra likely already exists — INVESTIGATE FIRST, do not assume greenfield:** `packages/slug/src/shapesBake.test.ts`, `bake.ts`, `glb.ts`, `format.ts`, and a **`packages/uikit/src/cli.ts`**. Determine exactly what shape baking/serialization is already implemented and tested, and scope the plan to *complete* it, not duplicate it.

## What "done" should deliver (shape the plan around this)

1. **Offline bake**: a CLI that takes a set of SVGs (e.g. an icon set / a directory / lucide subset) and emits a **packed `.glb`** shape-table file — one `SlugShapeSet` containing all shapes, each addressable by a stable id/name. Mirror slug's `cli.ts`/`bake.ts`/`glb.ts`/`format.ts`.
2. **Loader with backends**: an SVG/shape loader analogous to `SlugFontLoader` — a **baked** backend (load the `.glb`, no parse at runtime) and the existing **runtime** parse backend, behind one API. Baked↔runtime equivalence guarded by a test like `baked.equivalence.test.ts`.
3. **Shared-set batching**: uikit's `Svg`/icon components resolve icons against the **shared** baked `SlugShapeSet` so `ShapeGroupManager` batches them → ~1 draw per order-band. Prove the draw-call drop with a live/vitexec count on uikit-bento (26 → target N).
4. **Examples in pairs** (three + react) demonstrating the baked-icon-atlas path (CLAUDE.md rule).
5. **Public API** threaded properly (three-flatland + `/react` subpath conventions).
6. **A bake manifest file** (stakeholder ask): a declarative input that tells the baker *which* shapes to bake and how — source SVG paths/globs, stable shape names/ids, per-shape options (fill rule, scale/normalization, tolerance), output `.glb` target, and set metadata. The CLI consumes the manifest (analogous to how slug's `cli.ts` takes Unicode-range selection). Design it so a project checks the manifest into source and re-bakes deterministically. Mirror/extend any existing config shape in `packages/uikit/src/cli.ts` — investigate before inventing a new format.
7. **Docs (stakeholder ask):** a `packages/slug/CLAUDE.md`-style doc (and/or user-facing docs page) on shape-set baking that teaches **how to reason about what to bake** — when to bake vs parse at runtime, how sharing one set enables batching (the draw-call win), the size/packing tradeoffs of a large shared set, how the manifest drives it, and the baked↔runtime equivalence guarantees/limits. This is the "shapes" analogue of `slug/CLAUDE.md`'s font-bake guidance.

## Hard constraints (from CLAUDE.md / memory — put in every horde brief)

- WebGPU + WebGL2 via TSL only; no GLSL, no `onBeforeCompile`. `RenderTarget` not `WebGLRenderTarget`.
- Each package keeps **clean imports** — no cross-package utility pulls; slug owns its shape code, uikit consumes slug's public API.
- Reuse `cubicToQuadratics` (one converter). Baseline/packing math lives in one place — don't fork it.
- Examples exist in **pairs** or neither. Planning docs under `/planning`. TSDoc terse (WHAT first, WHY only if non-obvious).
- Conventional Commits; no AI-attribution trailers; commit only when asked.

## Open questions for the planner to resolve (with evidence)

- What does `shapesBake.test.ts` + `bake.ts` + `glb.ts` + `format.ts` + `uikit/src/cli.ts` **already** implement for shapes? What's genuinely missing?
- Offline-bake-all-icons-into-one-`.glb` vs a runtime lazily-grown shared atlas — or both? Which is the primary "batch icons" path?
- How does an icon component select its shape from the shared baked set (name/id lookup)? How do lucide icons map in?
- Render-order-band interactions: even with a shared set, icons at different z-bands split — quantify realistic draw-count after batching (26 → ?).
- Baked↔runtime equivalence contract for shapes (the guard test).

## Plan output requirements

- Write the plan to `planning/superpowers/plans/svg-bake-pipeline.md`.
- Decompose into **discrete, independently-verifiable units** (the horde executes these): each unit gets context, exact task with file:line anchors, method (TDD red-first), **exact gates/commands** defining green, a DO-NOT list, and acceptance criteria. Mark which units are parallel (disjoint files/new dirs) vs serialized (shared hot files).
- Sequence: what can land incrementally (shared-set batching may be shippable BEFORE the full offline bake), and what the offline-bake + loader depends on.

# Docs Diátaxis Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every prose edit MUST also load the `documentation` skill (type rules + split recipe) and `marketing-voice` (calm register).

**Goal:** Bring the three-flatland docs to Diátaxis type purity — every page is exactly one type (tutorial / how-to / reference / explanation) — without losing any content, by relocating mixed-in spans to their correct page and replacing them with cross-links.

**Architecture:** Content moves, not rewrites. Each mixed-mode page keeps only its declared-type spans; how-to/reference/explanation spans that don't belong are relocated to the right page (or the generated API reference) and replaced with a one-line cross-link. Generated API pages exist for `three-flatland`, `@three-flatland/nodes`, and `@three-flatland/presets` only — so option tables for those packages link to `/three-flatland/api/...`; skia/slug/bake/devtools have no generated API surface and are handled per Task 1.

**Tech Stack:** Astro + Starlight MDX (`docs/src/content/docs/`), starlight-typedoc (generated API under `docs/src/content/docs/api/`), the `documentation` and `marketing-voice` skills.

**Source of truth for the audit that produced this plan:** the 2026-05-24 full 4-layer audit (this session). Type-pure templates to imitate: `guides/lighting.mdx`, `guides/shadows.mdx` (Explanation); `guides/devtools.mdx`, `guides/baking.mdx` (How-to); `getting-started/quick-start.mdx` (Tutorial).

**Verification used throughout:**
- Build: `NODE_OPTIONS="--max-old-space-size=8192" pnpm --filter=docs build` must exit 0.
- Type purity: after each split, re-read the page and confirm it passes its type's must-not list (`.claude/skills/documentation/diataxis.md`).
- Links: every cross-link resolves at correct relative depth; anchors match heading slugs.

---

## Task 1: Decide and stand up the API/reference link targets

**Files:**
- Modify: `docs/astro.config.mjs` (starlightTypeDoc `entryPoints`)
- Verify: `docs/src/content/docs/api/` regenerates

Tables can only be lifted to the API if an API page exists. Today: `three-flatland`, `nodes`, `presets` are covered; `skia`, `slug`, `bake`, `devtools` are not.

- [ ] **Step 1: Decide per package.** For `@three-flatland/devtools` (stable, has `createPane`/`usePane` JSDoc'd), add it to TypeDoc. For `@three-flatland/skia` and `@three-flatland/slug` (Experimental), do NOT expand the public API surface yet — instead keep a **trimmed** task-scoped table on the guide (the handful of fields the task sets) and link the package README on GitHub for the full surface. `bake` already has a CLI guide; no API page needed.

- [ ] **Step 2: Add devtools to entryPoints.** In `docs/astro.config.mjs`, add `'../packages/three-flatland/src/devtools'`-equivalent entry — actually add `'../packages/devtools/src/index.ts'` and `'../packages/devtools/src/react.ts'` to the `entryPoints` array.

```js
entryPoints: [
  '../packages/three-flatland/src/index.ts',
  '../packages/three-flatland/src/react/index.ts',
  '../packages/nodes/src/index.ts',
  '../packages/presets/src/index.ts',
  '../packages/devtools/src/index.ts',
  '../packages/devtools/src/react.ts',
],
```

- [ ] **Step 3: Rebuild and confirm the new API pages exist.**

Run: `NODE_OPTIONS="--max-old-space-size=8192" pnpm --filter=docs build`
Expected: exit 0; `docs/src/content/docs/api/devtools/` (or `api/three-flatland/...`) generated.

- [ ] **Step 4: Record the canonical link targets** for use in later tasks (verify each resolves):
  - `FlatlandOptions` → `/three-flatland/api/three-flatland/src/interfaces/flatlandoptions/`
  - `Sprite2D` → `/three-flatland/api/three-flatland/src/classes/sprite2d/`
  - `AnimatedSprite2D`, `TileMap2D`, `Layers`, `SpriteGroup` → same `classes/` / `variables/` pattern
  - nodes catalog → `/three-flatland/api/nodes/src/`
  - `DefaultLightEffect` → `/three-flatland/api/presets/src/classes/defaultlighteffect/`

- [ ] **Step 5: Commit.**

```bash
git add docs/astro.config.mjs docs/src/content/docs/api
git commit -m "docs(api): generate reference pages for @three-flatland/devtools"
```

---

## Task 2: Split `guides/flatland.mdx` (Concept) — extract how-to + reference

**Files:**
- Modify: `docs/src/content/docs/guides/flatland.mdx` (keep Explanation only)
- Create: `docs/src/content/docs/guides/flatland-setup.mdx` (How-to)
- Modify: `docs/astro.config.mjs` (add `flatland-setup` to the Guides sidebar group)

The page is Explanation but carries Basic Setup, Adding Objects, Render Loop, Post-Processing, Render-to-Texture, Disposal (how-to) and Constructor Options + method/uniform tables (reference).

- [ ] **Step 1: Create the How-to page** `guides/flatland-setup.mdx` with frontmatter `title: Set up a Flatland scene`, `description: Create a Flatland instance, add objects, drive its render loop, and dispose it.` Move into it (cut from `flatland.mdx`): the Basic Setup tabs + the R3F-phase caution, Adding Objects code, Render Loop code, Post-Processing recipe, Render to Texture, Disposal. Add `import { Tabs, TabItem } from 'starlight-theme/components'`. Open with a one-line "what you'll do." Apply `marketing-voice` calm register.

- [ ] **Step 2: Reduce `flatland.mdx` to Explanation.** Keep: intro, "When to Use Flatland vs SpriteGroup" table, the render-loop **diagram** + narrative (concept), the auto-vs-manual time *concept* (one paragraph, no table). Delete the Constructor Options table and the method/uniform/stats tables. Replace the deleted setup spans with one cross-link line:

```mdx
For setup, the render loop, post-processing, and disposal, see [Set up a Flatland scene](../flatland-setup/). For every constructor option and method, see the [`Flatland` API reference](/three-flatland/api/three-flatland/src/classes/flatland/).
```

- [ ] **Step 3: Register the new page** in `docs/astro.config.mjs` Guides `items` array (after the `flatland`/concepts entries — it's a Guide):

```js
{ label: 'Flatland Setup', slug: 'guides/flatland-setup' },
```

- [ ] **Step 4: Build + verify.**

Run: `NODE_OPTIONS="--max-old-space-size=8192" pnpm --filter=docs build`
Expected: exit 0. Then re-read both pages: `flatland.mdx` has no code recipes or option tables (Explanation must-not); `flatland-setup.mdx` has no conceptual deep-dives (How-to must-not).

- [ ] **Step 5: Commit.**

```bash
git add docs/src/content/docs/guides/flatland.mdx docs/src/content/docs/guides/flatland-setup.mdx docs/astro.config.mjs
git commit -m "docs: split Flatland concept from its setup how-to (Diátaxis)"
```

---

## Task 3: Split `guides/pass-effects.mdx` (How-to) — the worst offender

**Files:**
- Modify: `docs/src/content/docs/guides/pass-effects.mdx` (keep How-to only)
- Modify: `docs/src/content/docs/guides/lighting-setup.mdx` (receive the DefaultLightEffect schema) OR link to its API page
- Create (optional): `docs/src/content/docs/guides/effects.mdx` (Concept — the three effect layers)

Spans: effect-layers comparison (Explanation), the how-to (keep), the `@three-flatland/nodes` catalog (Reference), and a **misfiled `DefaultLightEffect` schema** that is a LightEffect, not a PassEffect.

- [ ] **Step 1: Move the misfiled `DefaultLightEffect` schema.** Cut the "DefaultLightEffect Schema" section out of `pass-effects.mdx`. It documents a preset's full option set → it is Reference for `presets`. Replace with a link, and ensure `lighting-setup.mdx` (which already references the schema) is the prose home:

```mdx
For the full `DefaultLightEffect` option set, see the [`DefaultLightEffect` API reference](/three-flatland/api/presets/src/classes/defaultlighteffect/) and the [Lighting setup guide](../lighting-setup/).
```

- [ ] **Step 2: Move the node catalog.** Cut the "Available TSL Nodes" tables (CRT/Scanlines/LCD/Retro/Analog). Replace with the 2-3 nodes the page's examples actually call plus:

```mdx
The full post-processing node catalog lives in the [`@three-flatland/nodes` API reference](/three-flatland/api/nodes/src/).
```

- [ ] **Step 3: Handle the effect-layers Explanation.** If creating `guides/effects.mdx` (Concept), move the "Three Effect Layers" comparison there and register it under Concepts in `astro.config.mjs`. Otherwise, move that prose into the existing `guides/flatland.mdx` effect-system narrative. Replace in `pass-effects.mdx` with:

```mdx
For how pass effects relate to material and light effects, see [The effect layers](../effects/).
```

- [ ] **Step 4: Retitle to the how-to shape.** Change frontmatter `title` to a gerund task: `Add post-processing passes`.

- [ ] **Step 5: Build + verify** (exit 0; `pass-effects.mdx` now contains only the define→add→chain→tune→manage recipe; no node catalog, no schema dump, no layer theory).

- [ ] **Step 6: Commit.**

```bash
git add docs/src/content/docs/guides/pass-effects.mdx docs/src/content/docs/guides/lighting-setup.mdx docs/astro.config.mjs
git commit -m "docs: split pass-effects into a pure how-to; relocate node catalog + DefaultLightEffect schema"
```

---

## Task 4: Trim `guides/batch-rendering.mdx` (Concept) to Explanation

**Files:**
- Modify: `docs/src/content/docs/guides/batch-rendering.mdx`
- Modify (target): the how-to home for the optimization tips (a new `## Optimization` section appended to `guides/sprites.mdx`, or a short standalone — decide in Step 1)

Keep: "How It Works" + the interleaved-buffer-layout explanation + diagrams (the page's strongest assets). Move: Renderer Options table (Reference), Optimization Tips (How-to).

- [ ] **Step 1: Move Renderer Options table → API link.**

```mdx
For every `SpriteGroup` constructor option, see the [`SpriteGroup` API reference](/three-flatland/api/three-flatland/src/classes/spritegroup/).
```

- [ ] **Step 2: Relocate Optimization Tips.** Move the "Optimization Tips" (Share Materials / Atlases / Layers do-and-don't recipes) into a How-to home — append as a "## Optimizing batches" section in `guides/sprites.mdx` (the closest task page), or keep three sentences of *why* in batch-rendering and link out. Replace in batch-rendering with:

```mdx
For the practical do's and don'ts — sharing materials, atlasing, layer assignment — see [Optimizing batches](../sprites/#optimizing-batches).
```

- [ ] **Step 3: Build + verify** (exit 0; batch-rendering now reads as pure Explanation: mechanism + buffer layout, no option table, no recipe lists).

- [ ] **Step 4: Commit.**

```bash
git add docs/src/content/docs/guides/batch-rendering.mdx docs/src/content/docs/guides/sprites.mdx
git commit -m "docs: trim batch-rendering to explanation; move options to API and tips to a how-to"
```

---

## Task 5: Lift inlined reference tables out of the How-to guides

Each guide keeps only the fields the task sets; the full table moves to the API page (or, for skia/slug, a trimmed table stays per Task 1). One sub-task per page; commit per page.

**Files + spans (cut the table, insert the link):**

- [ ] **5a `guides/sprites.mdx`** — anchor-values table, the `lit/receiveShadows/castsShadow/shadowRadius` table, the Layers enum listing → `Sprite2D` + `Layers` API.
  Link: `Full property reference: [`Sprite2D` API](/three-flatland/api/three-flatland/src/classes/sprite2d/).`
  Verify + commit `docs: lift Sprite2D reference tables to the API page`.

- [ ] **5b `guides/animation.mdx`** — "Animation Set Definition" field enumeration → `AnimatedSprite2D` / `AnimationSetDefinition` API. Keep the playback recipes.
  Verify + commit `docs: link animation-set reference to the API page`.

- [ ] **5c `guides/loaders.mdx`** — Available Loaders table, Available Presets table, custom-data field table → API. Keep the per-loader task snippets.
  Verify + commit `docs: lift loader reference tables to the API page`.

- [ ] **5d `guides/tilemaps.mdx`** — the `TileMapData` interface block → `TileMap2D`/types API.
  Verify + commit `docs: link TileMapData interface to the API page`.

- [ ] **5e `guides/lighting-setup.mdx`** — the Light2D Properties table and the Presets table → `Light2D` + presets API (the exact smell named in the skill). Keep the per-type task snippets and the `type`-vs-`lightType` note.
  Verify + commit `docs: lift Light2D properties table to the API page`.

- [ ] **5f `guides/shadows-setup.mdx`** — the Tuning uniforms table → `DefaultLightEffect` API (already half-links to pass-effects/lighting).
  Verify + commit `docs: link shadow tuning uniforms to the API page`.

- [ ] **5g `guides/tsl-nodes.mdx`** — the node catalog (Sprite Sampling / Color / Effect / Retro sections) → `/three-flatland/api/nodes/src/`. Keep the 2-3 nodes the damage-flash/dissolve tasks call.
  Verify + commit `docs: link the TSL node catalog to the nodes API`.

- [ ] **5h `guides/skia.mdx`** (Experimental) — TRIM "Common Paint Props" and SkiaGroup props to the fields the shown shapes use; link the package README for the full surface (no generated API per Task 1).
  Verify + commit `docs: trim skia reference tables to task-scoped fields`.

- [ ] **5i `guides/slug-text.mdx`** (Experimental) — TRIM SlugText Properties, Material Options, StyleSpan tables to task-scoped fields; link the README. Also add the missing "What you'll learn" intro block.
  Verify + commit `docs: trim slug-text reference tables; add intro`.

Each sub-task: cut table → insert link/trim → `pnpm --filter=docs build` (exit 0) → re-read page passes How-to must-not → commit.

---

## Task 6: Split `loaders.mdx`'s Baked Normal Pipeline (Explanation) out

**Files:**
- Modify: `docs/src/content/docs/guides/loaders.mdx`
- Modify (target): `docs/src/content/docs/guides/baking.mdx` (How-to) and/or a Concept page

The "Baked Normal Pipeline" section (atlas RGBA encoding, resolution-strategy internals, `forceRuntime` rationale, descriptor hashing) is Explanation living in a How-to.

- [ ] **Step 1:** Move the *conceptual* prose (RGBA encoding, hashing, why `forceRuntime` exists) to a Concept location — either a new `## How baked normals work` section near the top of the existing Shadows/Lighting concept, or a short Concept page. Keep on `loaders.mdx` only the task: "load with `normals: true`."

- [ ] **Step 2:** Replace with: `For how the baked-normal pipeline works (atlas encoding, hashing, runtime vs baked), see [the baking guide](../baking/#how-it-works).`

- [ ] **Step 3:** Build + verify (exit 0; loaders is now a set of load recipes, no internals essay).

- [ ] **Step 4: Commit** `docs: move baked-normal internals out of the loaders how-to`.

---

## Task 7: Make example pages single-feature tutorials (get-it command + dual-framework build walkthrough)

**Files:**
- Modify: each `docs/src/content/docs/examples/*.mdx` prose slot
- Modify: `docs/src/components/ExampleDetailLayout.astro` / `ExampleSplitView.astro` (surface the "get it" command)
- Modify: `docs/src/content/docs/showcases/breakout.mdx`

**Intent (corrected per stakeholder):** Examples ARE tutorials, each focused on **one prime feature** (even if it carries supporting machinery to show it off). An example page is two things: **(1) a "get it on your machine" command** and **(2) a how-it's-built walkthrough** using the existing Three.js / React code-sample tabs. The current prose slot drifts into mini-reference (option tables, API inventories) — that is the defect. Replace it with the build tutorial; option tables go to the API page.

- [ ] **Step 1 — the "get it" command.** Add a one-command pull to each example page (and/or the layout toolbar). **The first-party CLI does not exist yet** (only `bake`/`slug`/`skia` build bins) — so:
  - **Interim (ship now):** show a `degit`-style command against the repo subtree, plus a fresh git init, e.g.:
    ```bash
    npx degit thejustinwalsh/three-flatland/examples/react/basic-sprite my-app
    cd my-app && git init && pnpm install
    ```
    (variant-aware: `examples/three/<slug>` vs `examples/react/<slug>` — the slug + framework are already known to `ExampleSplitView`.)
  - **Target (separate subsystem — spec its own plan):** a first-party `three-flatland` / `create-three-flatland` CLI that pulls the isolated example into a freshly-`git init`'d, bootstrapped repo in one command (`npx three-flatland new basic-sprite --react`). This is NOT part of the docs restructure — note it as a companion feature; once it ships, swap the interim command for the first-party one.

- [ ] **Step 2 — the build walkthrough (per example page).** Replace the API-inventory/option-table prose with a **guided "how it's built" tutorial**: ordered steps that walk the reader through the example's construction, focused on the **one prime feature**, with the Three.js and React variants behind the existing `syncKey="framework"` code-sample tabs (the runnable source + live demo already carry the result). Move any full option tables to the matching API page; add the missing example→guide/API cross-links on `basic-sprite`, `animation`, `knightmark`, `tilemap`. Align the `examples/lighting` snippet `viewSize` to the runnable `640`.
  Commit per page or in one `docs: rebuild example pages as single-feature tutorials`.

- [ ] **Step 3 — showcases are uber-tutorials, NOT explanations.** **Reverse the audit's "split breakout" recommendation.** `breakout.mdx` is a full game with third-party deps and deep architecture — that depth is *correct* for a showcase (an uber-tutorial). Do **not** strip the architecture/collision/ECS/AI content. Work: ensure it reads as a build/tutorial narrative (ordered "how this game is built" arc) rather than a dry architecture dump, carry the same "get it" command, and keep the third-party-dependency usage. Showcases are simply deeper, broader tutorials than examples.
  Commit `docs: shape breakout as an uber-tutorial (keep the depth)`.

- [ ] **Step 4: Build + verify** (exit 0).

---

## Task 8: Close the engagement gaps (visuals + cross-links)

**Files:** `guides/shadows-setup.mdx`, `getting-started/quick-start.mdx`, `getting-started/introduction.mdx`, `guides/tilemaps.mdx`, `docs/src/content/docs/llm-prompts.mdx`

- [ ] **Step 1: `shadows-setup.mdx`** — add at least one visual: a `<Compare>` of shadows on/off (capture via `pnpm --filter=docs capture:examples lighting`) or an Excalidraw diagram of the opt-in flags (use the `excalidraw-diagram` skill; near-black gem palette). Add a Next-steps link to `../../examples/lighting/`.

- [ ] **Step 2: `quick-start.mdx`** — add a rendered screenshot of the resulting sprite (the tutorial promises "a thing on screen" and shows none).

- [ ] **Step 3: `tilemaps.mdx`** — add a Next-steps section linking `../../examples/tilemap/` and the `TileMap2D` API page.

- [ ] **Step 4: `introduction.mdx` / `llm-prompts.mdx`** — add one visual each (a diagram or rendered output), or accept the criterion miss if a visual would be noise (document the decision).

- [ ] **Step 5: Build + verify** (exit 0).

- [ ] **Step 6: Commit** `docs: add missing visuals and example cross-links`.

---

## Task 9: Final pass — re-audit with the `documentation` skill

- [ ] **Step 1:** Re-run the type-purity layer (Layer 2 #5) across every page touched. Each must pass its type's must-not list.
- [ ] **Step 2:** `NODE_OPTIONS="--max-old-space-size=8192" pnpm --filter=docs build` exit 0; spot-check 3 split pages in the browser for layout + no broken links.
- [ ] **Step 3:** Confirm no orphaned cross-links (every `../X/` and `/three-flatland/api/...` resolves).
- [ ] **Step 4: Commit** any final fixes.

---

## Self-Review

**Spec coverage (audit P1 items → task):** flatland split → T2; pass-effects quadruple-mix + misfiled DefaultLightEffect → T3; batch-rendering trim → T4; sprites/animation/loaders/tilemaps/lighting-setup/shadows-setup/tsl-nodes/skia/slug-text table lifts → T5; loaders baked-normal Explanation → T6; example pages → single-feature tutorials (get-it command + dual-framework walkthrough) → T7; visuals/cross-link gaps → T8; nodes/devtools API targets → T1. All P1 + P2 findings mapped.

**Audit correction:** the audit flagged `breakout` as "Explanation in showcase costume" and proposed splitting it. Per stakeholder, that is wrong — examples and showcases are BOTH Tutorials (examples = one prime feature; showcases = uber-tutorials: full games, third-party deps, deeper). T7 Step 3 keeps breakout's depth and shapes it as a build narrative; it does not split it.

**Known decisions deferred to execution (not placeholders — explicit forks):** T1 Step 1 (devtools in TypeDoc; skia/slug stay trimmed); T3 Step 3 (new `effects.mdx` vs fold into flatland); T4 Step 2 (tips home); T7 Step 1 (interim `degit` command now, first-party `three-flatland new` CLI as a separate companion subsystem). Each fork has a recommended option stated.

**Out of scope:** P0 accuracy fixes (already committed `9ee4710f`); the `SpriteGroup.stats` JSDoc stale "See Flatland.stats" comment (source-side, file separately).

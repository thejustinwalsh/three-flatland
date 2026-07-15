# Card-Game Showcase — Prerequisites & Brainstorming Handoff (Epic 2)

**Status:** Not plannable yet. This document flags gating prerequisites and tees up a brainstorming session. It is intentionally **not** a task-by-task plan — the gameplay mechanic is undecided and several gating subsystems are unbuilt.

**Depends on:** Epic 1 — Lighting Unification (`planning/superpowers/plans/2026-05-27-lighting-unification.md`).

---

## The showcase concept (from stakeholder)

A card game that pressure-tests flatland across multiple modalities in a single composited scene:

| #   | Modality                                                                                     | What it exercises                                                                               |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | 3D gameboard scene with lighting + animation (main play area)                                | standard three.js 3D rendering + the unified lighting pipeline on 3D meshes                     |
| 2   | 2D card faces in a texture atlas, 2D animated + lit (sprites / SpriteGroup batching)         | flatland sprite batching + lit pipeline, rendered with an **ortho camera into a render target** |
| 3   | 2D card faces texture-mapped onto a 3D card surface using scene lighting for surface effects | render-to-texture → 3D material; 2D-output composited into 3D and re-lit                        |
| 4   | 2D animated avatars (likely billboarded) rendered in the **same pass** as the 3D background  | single-pass composite of lit 2D sprites + 3D; selective light binding per material              |
| 5   | Flatland/SpriteGroup UI layer over the whole app                                             | screen-space sprite overlay                                                                     |
| 6   | **Perspective** camera                                                                       | first non-ortho usage; validates 2D sprite positional math outside ortho                        |

This is deliberately the hardest composite we can pose: multipass rendering, 2D+3D in one scene, lighting unified through standard three.js, and ortho-vs-perspective positional math.

---

## Gating prerequisites (status verified 2026-05-27)

Ordered by how hard they block the showcase. **None of the first three are implemented.**

### P1 — Render targets / RTT + 2D→3D texture projection — **DESIGNED, NOT IMPLEMENTED**

- Spec: `planning/milestones/M10-render-targets.md` (defines `RenderTarget2D`, 2D→3D projection, compositing; explicitly names "card game faces" as a use case).
- Blocks modalities **2 and 3** (card faces are a flatland ortho pass rendered to a texture, then mapped onto a 3D card surface).
- **This is the long pole.** Needs its own plan before the showcase.

### P2 — Perspective camera + sprite positional math in non-ortho — **NOT READY**

- The sprite system is orthographic-only today (Y-sort `zIndex = -floor(y)`, ortho world bounds feeding the tiler). Perspective changes world-bounds→tile math and depth.
- Blocks modalities **4 and 6** directly; touches **1** (shared camera).
- No spec exists. Needs design: how SpriteGroup world bounds, the lighting tiler's screen-space assumptions, and Y-sort behave under perspective. Note the Epic 1 plan flags `normalView` space-alignment as "re-validate under perspective."

### P3 — Billboard sprites — **NOT READY**

- Camera-facing quads in a 3D perspective scene need vertex/shader support not present today.
- Blocks modality **4** (animated avatars in the 3D pass).
- No spec. Likely a SpriteGroup/material vertex-layout addition.

### P4 — Picking / hit-testing — **NOT SCOPED**

- Only architectural readiness exists: `planning/superpowers/specs/2026-04-23-interleaved-instance-buffer-design.md` reserves `instanceExtras.y` for a picking ID. No spec, no plan, no branch.
- Blocks **interactivity** (clicking/dragging cards). A non-interactive showcase could ship without it, but a _card game_ implies interaction.
- Needs its own spec + plan. Decide scope: 2D sprite picking only, or unified 2D+3D picking under one camera.

### Already in place (not blocking)

- Sort layers + auto-batch boundaries — implemented + verified (`SORT-LAYERS-DESIGN.md`, `AUTO-BATCH-DESIGN.md`, recent sprite-sort commits).
- Sprite animation — implemented (`M2-animation-system.md`).
- Lighting on sprites + 3D — delivered by Epic 1.
- Multi-pass orchestration design — `ecs-render-graph/02-architecture.md` (Phase 1 shipped).

---

## Modality → prerequisite matrix

| Modality                       | P1 RTT | P2 Perspective | P3 Billboard | P4 Picking |
| ------------------------------ | :----: | :------------: | :----------: | :--------: |
| 1 — 3D board + lighting        |        |       ●        |              |            |
| 2 — 2D card faces (atlas, lit) |   ●    |                |              |            |
| 3 — Card faces on 3D surface   |   ●    |       ●        |              |            |
| 4 — Avatars in 3D pass         |        |       ●        |      ●       |            |
| 5 — UI overlay                 |        |                |              |    (○)     |
| 6 — Perspective camera         |        |       ●        |              |            |
| Interactivity (play the game)  |        |                |              |     ●      |

● = hard dependency, ○ = only if the UI is interactive.

---

## Recommended sequencing

1. **Epic 1 — Lighting Unification** (planned). Merge first; the showcase's lighting story rides on it.
2. **Brainstorm the card game** (below) — decide the gameplay mechanic so the prerequisite scope is right-sized (e.g. a solo deckbuilder may not need head-to-head networking; a battler needs an AI opponent).
3. **Plan + build the gating subsystems as their own epics**, likely in this order: P1 (RTT) → P2 (perspective + sprite math) → P3 (billboards) → P4 (picking). Each gets its own `writing-plans` pass with characterization tests and the same no-regression discipline as Epic 1.
4. **Plan + build the showcase** once P1–P4 (as scoped by the brainstorm) are in.

---

## Brainstorming session — agenda (run `superpowers:brainstorming` before any Epic 2 planning)

Inputs to bring:

- **Card dataset:** `~/Developer/alchemy-cards` (existing alchemy card deck — confirm schema/asset format, atlas-readiness, card count).
- This prerequisites doc.

Decisions the brainstorm must produce:

1. **Gameplay mechanic** — solo roguelike deckbuilder (Slay-the-Spire / Dicey-Dungeons shape) vs. head-to-head card battle (AI or human opponent). This single choice cascades into picking scope, turn/state model, and whether networking/AI is in scope.
2. **Interactivity surface** — what is clickable/draggable (cards, board slots, avatars)? Determines P4 picking scope (2D-only vs unified).
3. **Card-face authoring** — how alchemy-cards data + art become a flatland texture atlas with 2D animation; baked vs runtime atlas.
4. **Scene composition** — exact pass graph (ortho card-face pass → RTT → 3D board pass with composited sprites + UI overlay), confirming it matches the `ecs-render-graph` model.
5. **Minimum showcase scope** — smallest version that exercises all six modalities, to bound the build.

Output: a brainstorm doc in `planning/superpowers/specs/`, then per-subsystem plans (P1–P4) and finally the showcase plan.

# Batched-Sprite Pointer Events (#127) — Implementation Plan

> **For agentic workers:** This plan is written for horde execution — parallel implementation agents under hard gates, with a lead who owns correctness. REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans, task-by-task with checkbox (`- [ ]`) tracking. The lead runs every phase gate personally.
>
> **Branch:** `feat/batched-sprite-events` (worktree `.claude/worktrees/issue-127-batched-events`)
> **Issue:** [#127](https://github.com/thejustinwalsh/three-flatland/issues/127) · **Spec:** `planning/superpowers/specs/2026-06-12-event-system-design.md` (D1, §5, §7, §7.3, §8) · **Design:** `planning/milestones/AUTO-BATCH-DESIGN.md`, `planning/milestones/RENDERING-ARCHITECTURE.md`

---

## 1. Ground truth (verified 2026-07-20, headless probes on this branch)

Every claim below was probed against the live code before this plan was written. Three sprite-management modes exist, and they are in **materially different states**:

| Mode | Graph citizen? | Traversal-raycastable? | `instanceMatrix` source | Verified behavior |
|---|---|---|---|---|
| Standalone (`scene.add(sprite)`, unbatched) | ✓ | ✓ | n/a (own Mesh) | works |
| **Auto-batched** (`scene.add(sprite)` ×2 sharing run key) | ✓ (stays in user tree, `visible=false`) | **✓ — already works.** `intersectObjects(scene.children, true)` hits it; `matrixWorld` correct | local TRS recompose (`transformSyncSystem`) | hit-test right, **render wrong under nested parents** |
| **Explicit** (`spriteGroup.add` / `flatland.add`) | **✗** (`sprite.parent === null`, ECS-only) | **✗** — traversal returns `[]` | local TRS recompose | direct `intersectObject(sprite)` works only via the interim fix |

Probe results (exact numbers):

1. **Auto path, flat scene:** batched sprite (visible=false, in user tree) is found by `raycaster.intersectObjects(scene.children, true)` with `matrixWorld.elements[0] === 100` (its scale). Three's `Raycaster` ignores `visible` — this is load-bearing and standard three behavior.
2. **Auto path, nested transformed parent** (`Group` at x=500 containing 2 sprites): `instanceMatrix` tx = **0**, `matrixWorld` tx = **500**. **The rendered position is wrong** — `transformSyncSystem` (`packages/three-flatland/src/ecs/systems/transformSyncSystem.ts:63`) composes from local TRS and never reads parents. This is a live **rendering** bug on the shipped auto path, not just a hit-test gap.
3. **Flatland path:** `sprite.parent === null` after `flatland.add()`; `intersectObjects(flatland.scene.children, true)` → `[]`.
4. **Demotion pruning bug (new):** demoting a SpriteGroup-managed sprite via `renderOrder = 999` reparents it under the group (`_demoteToStandalone`, `Sprite2D.ts:2014`), and the **very next schedule run `sceneGraphSyncSystem` removes it from the graph** (`sceneGraphSyncSystem.ts:49-54` prunes every child not in `activeMeshes`). The demoted sprite vanishes. The auto path escapes only because its sprites were never group children.

### Corrections to the briefing diagnosis

- **"#85 never delivered its promise" is half-right.** The Phase-2 orchestration epic DID land: per-(renderer,scene) registry, dual-signal registration, auto-batch with tier ladder/hysteresis, run-key routing (`src/orchestration/*`, all green-tested). Auto-batched sprites ARE graph citizens and ARE traversal-raycastable **today**. What never landed is (a) graph citizenship for the **explicit** SpriteGroup/Flatland path, and (b) the AUTO-BATCH-DESIGN line-29 invariant *"`instanceMatrix` set from `matrixWorld`"* — asserted in the design's promotion-safety proof, implemented nowhere. #127's "interactive for free once #85 lands" was true for the auto path and unspecified for the explicit path.
- **R3F never needed scene-graph discoverability.** Verified in installed `@react-three/fiber@10.0.0-alpha.2` (`dist/index.mjs:665`): R3F raycasts its flat interaction list per-object — `state.raycaster.intersectObject(obj, true)` — not the scene. Direct raycast + a fresh matrix is all R3F needs, which is why the interim fix unblocked the starter templates. What R3F DOES need the parent chain for is **event bubbling** (`index.mjs:686`: `eventObject = eventObject.parent`) — with `parent === null`, ancestor handlers never fire.
- The root-cause statement — duplicated transform math between `Sprite2D.updateMatrix()` (`Sprite2D.ts:2047`) and `transformSyncSystem` (`:63`), so render truth and hit truth cannot agree by construction — is **confirmed**, with the sharper corollary that on the auto path it is the *renderer* that is wrong and the hit test that is right.

---

## 2. Goal

Per spec §5: a raycast hit on any flatland primitive yields `intersection.object === <the user-facing primitive>`, whether standalone, auto-batched, or SpriteGroup/Flatland-batched; `raycaster.intersectObjects(scene.children, true)` finds batched sprites; batches never appear in intersections; R3F `onPointer*` (render-to-screen and portal/RTT) works on batched sprites. And the transform that renders must be the transform that hit-tests: **one source of truth.**

---

## 3. Decisions

### D-A — Single source of truth: `matrixWorld` is authoritative; batch slots are derived data

`instanceMatrix[slot] := sprite.matrixWorld`, copied **after** matrix propagation each frame. `transformSyncSystem`'s independent TRS recompose is deleted. `SpriteBatch.matrixWorld` is pinned to identity (override `updateMatrixWorld` to skip composition) so the shader's `modelMatrix × instanceMatrix` = `sprite.matrixWorld` exactly.

**Why this is viable (the checks the briefing asked for):**

- **Per-frame cost:** today `transformSyncSystem` runs an inline 2D compose per sprite per frame (`autoInvalidateTransforms` defaults true). The new shape is three's propagation (which already calls our fast `Sprite2D.updateMatrix()` override — same 2D math) + one 16-float copy per slot. Net delta ≈ one 4×4 parent-multiply + memcpy per sprite; at 16k sprites ≈ 1 MB/frame of copies, same order as today. **Gate: measure, don't assume** (Phase 1 gate, ±10% on the schedule micro-benchmark and knightmark 60fps).
- **`matrixWorldAutoUpdate = false` rationale survives intact.** Flatland disables it so *internal passes* (occlusion, SDF, shadow) don't re-trigger the schedule via `renderer.render` (`Flatland.ts:298-303, 1243-1256`). The single explicit `scene.updateMatrixWorld(true)` in `Flatland.render()` remains the one propagation per frame; it now also composes the (new) sprite children. Nothing about the guard model changes; `scheduleRuns` re-entrancy guards stay.
- **Ordering** is the real work — see §4 (two-stage schedule). The invariant: *slot matrices are copied from `matrixWorld` after the last `matrixWorld` write of the frame and before any render that consumes them (shadow/occlusion/main).*
- **Group transforms don't double-apply:** with sprites as group children (D-B), a transformed SpriteGroup flows into `sprite.matrixWorld`; pinning batch matrixWorld to identity prevents the old `batchWorld × instanceLocal` path from applying it twice. Pin with a transformed-SpriteGroup parity test (this behavior — group transform moves batched sprites — works today via the batch's inherited matrixWorld and must not regress).
- **Bonus honesty:** users with `matrixAutoUpdate=false` hand-managed matrices are respected now (today's recompose from TRS silently ignores them). `sortLayer*10 + zIndex*0.001` z-bake is unchanged — it lives in `updateMatrix()` and rides through `matrixWorld`.
- **`autoInvalidateTransforms=false`** (manual invalidation, static UIs): the copy pass is gated by the same flag + `invalidateTransforms()`. Divergence between fresh `matrixWorld` and stale slots is inherent to that opt-in mode; document that hits track logical state.

This makes AUTO-BATCH-DESIGN line 29 true and **fixes probe bug #2** (nested-parent auto rendering) as a side effect. That bug alone justifies D-A even if events didn't exist.

**Rejected alternative:** shared compose function between `updateMatrix` and `transformSyncSystem` (dedupes code, but keeps two call sites, still ignores parents, still no traversal discoverability). Rejected: fixes the symptom, not the two-sources disease.

### D-B — Graph citizenship for the explicit path: a hidden holder group

`SpriteGroup` gains an internal `Group` child (name `__batchedSprites`, `visible = false`). `SpriteGroup.add(sprite)` enrolls in ECS **then** parents the sprite under the holder (`holder.add(sprite)` — enroll-first so the `'added'` listener's `flatlandPrime` guard `sprite._flatlandWorld` short-circuits, `orchestrator.ts:57`). Effects:

- `raycaster.intersectObjects(scene.children, true)` traverses into the holder (three's raycast recursion ignores `visible`) and hits sprites; `projectObject` prunes the whole holder in **O(1)** (one `visible` check), so 100k hidden children cost the renderer nothing per pass — this sidesteps the N-visibility-checks-per-pass tax that per-sprite hiding would pay across Flatland's multiple internal passes.
- `sprite.visible` keeps meaning what the user thinks it means on the explicit path — no conflation with batch-suppression (the auto path's `visible=false`-when-batched conflation stays as shipped; see D-H).
- Matrix propagation reaches the sprites through the normal `super.updateMatrixWorld` recursion (visibility does not gate matrix updates).
- **R3F bubbling** now walks sprite → holder → SpriteGroup → flatland.scene, so ancestor handlers and portal-root semantics work.
- Demotion reparents holder → SpriteGroup (own-mesh draw resumes); `_demoteToStandalone`'s existing `registry.parentAdd` machinery simplifies.

**`sceneGraphSyncSystem` prune must be type-gated to `SpriteBatch` instances** (it currently removes *any* non-batch child — probe bug #4). This one-line class check fixes the demotion-vanish bug and makes the holder safe. Regression-test both.

**Reconciliation with spec §4/§14 ("reverse-lookup apparatus deleted, not deferred"):** honored. No `SpriteBatch.raycast` implementation (it stays the existing no-op override, `SpriteBatch.ts:598` — already correct, and critical: `InstancedMesh.raycast` would otherwise phantom-test every instance), no instance→sprite mapping, no batch participation in events. Discoverability comes from sprites being *real objects in the graph* — exactly the mechanism §5 assumed #85 would provide.

**Audit obligations:** every consumer of `spriteGroup.children` (`clear()`, `clone()`, devtools batch snapshots, stats) and the R3F removal path (`flatland.remove` → `spriteGroup.remove` must also detach from the holder; R3F StrictMode remount churn) — enumerate and test.

### D-C — The interim fix survives, upgraded and re-documented

`Sprite2D.raycast()`'s `this.updateMatrixWorld()` (and TileMap2D's) becomes `this.updateWorldMatrix(true, false)` — which also refreshes the *ancestor* chain, making it correct for parented sprites (a plain `updateMatrixWorld()` composes against a possibly-stale parent). Post D-A/D-B it is no longer compensating for a detached object — it is a freshness guarantee for raycasts issued outside the frame loop (setup code, tests, pre-first-render), equally valid for standalone sprites. The spec's "no interim code" clause (D1) is satisfied: the call's *reason* changed from workaround to documented contract. Pin with a pre-first-render raycast test. The `batchedRaycast.test.ts` characterization tests stay green throughout.

### D-D — R3F: no API changes; new coverage obligations

- **Render-to-screen** (`set({ camera: flatland.camera })`, the starter-template pattern) and **portal** (`createPortal(children, flatland.scene, { events: { compute: createFlatlandCompute(...), priority } })`) both already route rays through `flatland.camera`; per the R3F source verification, per-object raycast + correct `matrixWorld` is sufficient. `createFlatlandCompute` (`react/flatlandEvents.ts`) is untouched.
- New obligations: (a) bubbling test — handler on an ancestor fires for a batched-sprite hit; (b) portal-mode batched-sprite test; (c) `events.update()` hover-under-camera-motion unaffected (spec §8.3); (d) the react starter template's interaction keeps working (it exercises a *batched* sprite — Flatland's explicit path batches even a single sprite).
- **Known, documented limit:** handlers on the `<flatland>` element itself will not receive bubbled sprite hits — `flatland.scene` is not a child of the Flatland group, so the parent walk ends at the scene. Same posture as drei `View`. Document; do not hack the parent chain.

### D-E — TileMap2D: already a graph citizen; in scope for freshness + tests only

`flatland.add(tilemap)` goes to `scene.add` (`Flatland.ts:531`) — it was never in the ECS-only trap. Scope: the D-C `updateWorldMatrix` upgrade, plus traversal tests through `flatland.scene` (its `raycast` correctly `return false`s to suppress TileLayer child recursion — keep pinned).

### D-F — Performance & acceleration posture (spec §7.3 / issue note)

- **Per pointer event (R3F):** O(H) where H = handler-carrying objects; each `Sprite2D.raycast` ≈ one 4×4 invert + plane test (~100–200 ns) + the D-C ancestor refresh. ~1k simultaneously-interactive sprites ≈ 0.1–0.2 ms per pointermove: fine. **Vanilla traversal:** adds O(scene nodes) walk — same order.
- **Per frame:** the slot-copy pass, O(batched sprites), parity with today's `transformSyncSystem` (measured at the gate).
- **`SpatialGrid` stays unbuilt** (demoted-optional, spec §7.3). Build triggers, recorded here so profiling has a threshold: sustained >0.5 ms per pointer event, or >~2–5k simultaneously-interactive batched sprites. If ever adopted, the PoC's duplicate-candidate and high-water-rebuild bugs (spec §11) are required fixes. Very high instance counts belong to the #128 GPU ID-buffer path — unaffected by this plan (its `pick()` signature and `instanceExtras.y` reservation stand).

### D-G — Scope cuts (each with a tracked exit)

- **Per-slot user visibility** (`sprite.visible = false` on a batched sprite does not hide the drawn slot — true today on both paths, and after this plan a hidden-by-user batched sprite will still draw and still hit): **file a tracking issue** during Phase 4 with the candidate design (user-intent shadow flag + degenerate/zero slot matrix + raycast early-out) — it rides the same slot-copy code path built here, but it changes shipped observable semantics on the auto path (existing tests assert `visible === false` when batched) and deserves its own decision.
- **Auto-registry-inside-Flatland-scene edge** (sprites nested in plain Groups handed to `flatland.add` fall through to Signal-B auto-orchestration against `flatland.scene`, creating a second world without Flatland's lighting/material wiring): pre-existing, orthogonal. Characterize in one test if cheap, else document in the tracking issue.
- **`FlatlandTexture` component** stays #126; **drag helper** stays #129; **alpha sidecar** already shipped per its own plan.

---

## 4. The ordering problem (lead-owned design work)

Today the whole `SystemSchedule` runs at the *top* of `SpriteGroup.updateMatrixWorld`, **before** `super.updateMatrixWorld` propagates matrices (`SpriteGroup.ts:444-477`). A matrixWorld-slaved copy cannot live there. Restructure into two stages:

```
SpriteGroup.updateMatrixWorld(force):
  stage A (ECS mutation): deferredDestroy → materialVersions → effectTraits →
      batchAssign → batchReassign → batchSort → sceneGraphSync → batchRemove → lateAssign
      (+ prepended lighting CPU-prep systems)
  super.updateMatrixWorld(force)        // three composes group, holder, sprites, batches(identity-pinned)
  stage B (derived data + render): slotMatrixCopy (matrixWorld → instanceMatrix, markMatrixDirty,
      shadowRadius from matrix column lengths) → flushDirtyRanges → shadowPipeline/offscreen render systems
```

**Stage rule:** systems that only mutate ECS/CPU state → stage A; systems that read slot matrices or trigger renders (`flushDirtyRangesSystem`, `shadowPipelineSystem`, any offscreen pass) → stage B. Audit every system currently registered (including `Flatland.setLighting`'s prepends and appends around `Flatland.ts:1056`) against this rule — a shadow pass reading pre-copy slots would render one frame stale and break parity.

**Trigger points:**

- **Explicit path (SpriteGroup standalone or under Flatland):** both stages inside `SpriteGroup.updateMatrixWorld` as above. Sprites are holder children, so their `matrixWorld` is fresh when stage B runs. Flatland's `scene.updateMatrixWorld(true)` remains the sole per-frame trigger; re-entrancy (`_inSystems`, `scheduleRuns`) must guard both stages — shadow passes nest `renderer.render` which recurses into this override.
- **Auto path:** sprites live in the *user's* tree, possibly ordered after the hidden orchestrator group in traversal — a stage-B copy inside `group.updateMatrixWorld` can read stale matrices. Run the copy in `flatlandSceneSweep` (`orchestrator.ts:147`), which fires at `scene.onBeforeRender` — **after** the renderer's `updateMatrixWorld` and **before** `projectObject`. The sweep becomes an unconditional tail when the registry has batched entities (cost: the same O(N) copy the schedule pays today). **Verify the renderer ordering claim against the installed `three/webgpu` `Renderer.js`** (the orchestrator's comment cites updateMatrixWorld @1508 → onBeforeRender @1559 → projectObject @1575 — re-confirm before relying on it, and pin with a comment citing the verified lines).
- Guard double-copies with a per-registry frame stamp; on auto registries, the sweep copy is authoritative.

Contingency if the three-propagation cost regresses the benchmark: keep the 2D-specialized compose but perform it *in the copy pass* as `parentWorld × fastLocal` (single site, still matrixWorld-truth); this preserves D-A's invariant while restoring the specialized math.

---

## 5. Invariants to PROVE (not merely test)

These get explicit before/after evidence at gates; a failure blocks the phase.

| # | Invariant | Proof artifact |
|---|---|---|
| P1 | **Pixel parity** — batch-demo, knightmark, lighting, tilemap examples render byte-stable (or visually identical) before vs after | screenshot pairs (e2e or vitexec capture), attached to the PR per repo norm |
| P2 | **Draw-call parity** — hidden sprite children add zero draw calls (`renderer.info` delta / `flatland.stats`) | stats assertion in test + example probe |
| P3 | **Slot⇔world agreement** — for every mode (auto flat, auto nested, group, flatland, transformed group): `instanceMatrix[slot] === sprite.matrixWorld` after a frame | new parity suite (the test class that would have caught this bug — see §7) |
| P4 | **Promotion parity** — same pixels standalone vs batched for the same sprite state (AUTO-BATCH-DESIGN's table, now actually true) | nested-parent render test: promote, compare matrices; demote, compare again |
| P5 | **Perf floor** — knightmark 60fps; schedule micro-bench (16k sprites) within ±10%; 1→100k tier-ladder stress unchanged | recorded numbers in PR description, before/after |
| P6 | **No batch in intersections, no duplicate hits** — traversal over scenes with batches present yields only Sprite2D/TileMap2D objects, one record per sprite | traversal suite |
| P7 | **Sorting/lighting unaffected** — batchSort, sortLayer routing, shadow/lighting suites stay green with stage-B reordering | existing suites + shadow-pass freshness test |

---

## 6. Phases & tasks

Phase gates: `pnpm --filter=three-flatland typecheck && cd packages/three-flatland && pnpm vitest run` + lint, plus the phase's listed proofs. Lead runs gates; no phase overlaps its successor's files without lead sign-off. Commit per completed task, conventional commits, exact-path staging.

### Phase 0 — Characterize & baseline (lead, serial, small)

- [ ] Commit characterization tests for the probe findings: auto-nested `instanceMatrix ≠ matrixWorld` (as `.fails` / todo pinned to flip in Phase 1), explicit-path traversal-miss (flips in Phase 2), demotion-prune vanish (flips in Phase 2). Keep `batchedRaycast.test.ts` green — it pins the interim behavior we must not regress mid-flight.
- [ ] Record perf baselines: knightmark manual check, a 16k-sprite schedule micro-bench (vitest bench or timed loop), draw-call counts from batch-demo.
- [ ] Verify the `three/webgpu` renderer ordering (§4) against installed source; write findings into the orchestrator comment or plan notes.

### Phase 1 — Single source of truth (D-A, §4) — the risky core; smallest competent unit, tight lead review

- [ ] `SpriteBatch`: pin `matrixWorld` to identity (override `updateMatrixWorld`; keep `frustumCulled=false`); test that a transformed parent no longer flows into batch matrixWorld.
- [ ] Two-stage schedule split per §4 (`SystemSchedule` gains stages or a second schedule instance); audit + reassign every registered system per the stage rule, including Flatland lighting prepends/appends. Re-entrancy guards cover both stages.
- [ ] `slotMatrixCopySystem`: matrixWorld → slot copy + `markMatrixDirty` + shadowRadius from matrix column lengths (parity with `transformSyncSystem.ts:108-110`); `autoInvalidateTransforms` gating preserved.
- [ ] Auto-path sweep tail copy + frame-stamp guard (`orchestrator.ts`).
- [ ] Delete the TRS recompose from `transformSyncSystem` (the file likely dissolves into the copy system); update its tests and `conditionalTransformSyncSystem` wiring.
- [ ] Flip the Phase-0 nested-parent test to green.
- [ ] **Gate:** full suite + P3/P4/P5/P7 + P1/P2 spot-check on batch-demo. Transformed-SpriteGroup parity test green.

### Phase 2 — Graph citizenship (D-B) — parallelizable after Phase 1 lands

- [ ] Holder group in `SpriteGroup`; `add`/`addSprites` enroll-then-parent (order matters, §D-B); `remove`/`removeSprites`/R3F removal detach from holder; demotion reparents holder → group.
- [ ] `sceneGraphSyncSystem`: prune only `SpriteBatch` instances; demotion-prune regression test (Phase-0 test flips green).
- [ ] Audit `clear()`, `clone()`, `dispose()`, stats, devtools snapshots for the enlarged `children`; StrictMode remount test for the R3F path.
- [ ] Traversal suite: `intersectObjects(scene.children, true)` finds explicit-path batched sprites (flatland + bare SpriteGroup); P6 assertions; explicit-path traversal-miss test flips green.
- [ ] R3F bubbling test (ancestor handler fires); portal-mode batched-sprite compute test.
- [ ] **Gate:** full suite + P2 (no double-draw: sprite children render zero draws) + P1 screenshots + auto-path suites untouched.

### Phase 3 — Events surface & docs — wide parallel

- [ ] D-C freshness upgrade: `updateWorldMatrix(true, false)` in `Sprite2D.raycast` + `TileMap2D.raycast`; re-document from "interim" to freshness contract; pre-first-render raycast test; keep `batchedRaycast.test.ts` semantics.
- [ ] `examples/three/hit-test` + `examples/react/hit-test`: add a batched-sprites section (multiple sprites sharing a material, hover/click each independently) — the pair rule, both or neither.
- [ ] Docs: remove the D1 batched-caveat from the hit-test docs page; document the contract (§5 quote), the `<flatland>`-element bubbling limit (D-D), `visible` semantics note (D-G), perf guidance + acceleration thresholds (D-F).
- [ ] Starter-template check: react + three templates' interactions still work (they are the shipped consumers of the interim fix); update `templates/react/AGENTS.md` if guidance changed.
- [ ] Spec bookkeeping: addendum note in the event-system spec marking §7.3/D1 resolved by this plan (do not rewrite locked decisions; append a dated resolution note).

### Phase 4 — Verification & close-out (lead-heavy)

- [ ] e2e: pointer interaction on `examples/react/hit-test` with batched sprites (extend `e2e/smoke-examples.spec.ts` or a sibling spec) — click → observable state change, both render-to-screen and portal if the example supports both.
- [ ] P1 screenshot pairs for batch-demo/knightmark/lighting/tilemap; P5 numbers recorded in the PR description.
- [ ] 1→100k stress + hysteresis + tier suites green (unchanged).
- [ ] File the D-G tracking issues (slot visibility semantics; auto-registry-inside-Flatland edge if not characterized); cross-reference #128 (unaffected); update #127 with the diagnosis correction (auto path already worked; explicit path + transform truth were the real gap).
- [ ] Changeset: CI generates from conventional commits; verify the bump is minor-alpha and the release-visible packages are right.

---

## 7. Test strategy — the suite that would have caught this

The existing suites test bare sprites (`Sprite2D.raycast.test.ts`), raycast helpers, and Flatland separately; `batchedRaycast.test.ts` tests direct `intersectObject` only. The missing class is **combination + agreement** tests. Add `events/batchedPicking.test.ts` (or sibling) built on one parameterized harness:

> For each management mode — standalone / auto-flat / auto-nested-transformed-parent / SpriteGroup / SpriteGroup-transformed / Flatland / Flatland-with-TileMap — after one simulated frame: (1) direct `intersectObject(sprite)` hits at an off-center point; (2) `intersectObjects(scene.children, true)` returns the same hit with `object === sprite` and nothing batch-shaped; (3) `instanceMatrix[slot]` equals `matrixWorld` (P3); (4) hit `point`/`uv` match between direct and traversal paths.

Plus targeted regressions: demotion-prune (P0), shadow-pass slot freshness (P7), enroll-before-parent ordering (a sprite added to a SpriteGroup must not leak into auto-orchestration), R3F bubbling, pre-first-render raycast, transformed-group parity, spec §11's ledger items stay pinned (already shipped — do not disturb).

---

## 8. Risks & flags (lead attention)

1. **The stage split is the dangerous change.** It reorders systems relative to offscreen renders in the hot path. Mis-staging one lighting system = subtle one-frame shadow lag that screenshots may miss. Mitigation: the stage rule audit is a named task, and P7 includes a shadow-freshness test (mutate a sprite transform, render, assert the shadow pass consumed this frame's slots).
2. **Renderer-order assumption** for the auto sweep copy is verified-by-comment, not by us — Phase 0 re-verifies against installed three before Phase 1 builds on it.
3. **Traversal is now user-observable:** `scene.traverse` / `getObjectBy*` will find batched sprites (and the holder) where they found nothing before. This is the feature, but it is also a behavior change — release notes must say so.
4. **Auto-path `visible` conflation** remains (batched-but-drawn sprites report `visible === false`). Explicit path avoids it via the holder; the divergence between paths is documented, not resolved (D-G issue).
5. **Perf regression risk** concentrates in three's generic 4×4 parent-multiply replacing the specialized 2D compose. The §4 contingency (specialized compose in the copy pass) is pre-approved if P5 fails — do not invent a third option under time pressure.
6. If any Phase-1 evidence contradicts D-A viability (e.g. an ECS-ordering constraint not visible from this reading), **stop and escalate to the stakeholder** rather than adapting the architecture mid-horde — D-A is the load-bearing decision of this plan.

---

## 9. Required reading for implementers

`planning/superpowers/specs/2026-06-12-event-system-design.md` (§4-§8, §11) · `planning/milestones/AUTO-BATCH-DESIGN.md` (promotion table, event-driven model) · `planning/milestones/RENDERING-ARCHITECTURE.md` · source: `Sprite2D.ts` (`updateMatrix` :2047, `raycast` :1897, `_demoteToStandalone` :2014, added/removed handlers :1865), `pipeline/SpriteGroup.ts` (schedule :192-305, `updateMatrixWorld` :444), `pipeline/SpriteBatch.ts` (:88, :598), `Flatland.ts` (:292-362, :490, :1200-1307), `ecs/systems/transformSyncSystem.ts`, `ecs/systems/sceneGraphSyncSystem.ts`, `orchestration/orchestrator.ts`, `events/raycastHelpers.ts`, `react/flatlandEvents.ts` · tests: `orchestration/autoBatch.test.ts` (the auto-path contract), `events/batchedRaycast.test.ts`, `tilemap/TileMap2D.raycast.test.ts`.

---

## Stakeholder direction (2026-07-20) — resolve before dispatch

**1. Confirmed architecture: batch origin is identity; only instances carry world transforms.** This matches D-A and every major engine (Unity BRG, Unreal ISM/HISM, Godot MultiMesh, GPU-driven). It is settled — the implementation must not reintroduce any batch-level transform.

**2. Perf reconciliation — D-A copy pass vs single-writer ECS (must decide, with numbers).**
D-A as written computes `sprite.matrixWorld` via three's propagation, then copies 16 floats into the slot — adding a 4×4 parent-multiply + copy per sprite per frame, including the flat (identity-parent) common case we skip today. Stakeholder requirement: **keep the ECS direct-access fast path and do not regress.**
Reconcile one of two ways, and prove it:
- **(a) Prove the copy pass is within ±10%** on knightmark + the 16k bench, and keep D-A as written; or
- **(b) Single-writer ECS**: `matrixWorldAutoUpdate = false` on batched sprites; the schedule computes world directly (existing fast 2D compose direct-to-slot for identity-parent sprites, fold ancestor matrix only when a parent transform exists) and writes it to **both** the slot and `sprite.matrixWorld`. One compute feeds render + raycast; avoids the two-stage schedule split.
This interacts with D-B (graph children get propagated by three regardless) — the two must be reconciled explicitly. Phase 0 characterization must measure the copy-pass cost so the choice is evidence-based, not assumed.

**3. Culling — design so it is not foreclosed; do NOT build it now.**
Confirmed: nothing culls today (`SpriteBatch.frustumCulled = false`, `boundingSphere.radius = Infinity`). World-space instance matrices are the correct substrate for adding it later (whole-batch AABB → spatial clusters → GPU cull). Two constraints to honor now so a future culling pass is not blocked:
- Instance slot data stays **world-space** (falls out of decision 1).
- Any future cull-with-compaction must be **sort-stable** — batches are sorted by sortLayer/zIndex, so the slot layout and compaction design must preserve draw order. Do not adopt a slot-packing scheme that would make stable compaction impossible.
No culling code in this PR; this is a reserved-design note only.

## Correction (2026-07-20) — one hit-test contract, no new picking API

Earlier revisions of this plan invented `flatland.pick()` and promoted a hash-grid to "core broadphase." Both violate the event-system design and are dropped.

**There is exactly one hit-test in the repo:** `raycaster.intersectObject(sprite)` → `Sprite2D.raycast()`. Design D4 and §9 lock this — vanilla is plain `Raycaster`, "zero additional machinery"; R3F's `onPointer*` derive from the same contract. No `flatland.pick()`, no event library, no second path.

**#127 = Part A only.** Make `sprite.matrixWorld` the correct world transform for batched sprites so `Sprite2D.raycast()` works. That is the entire fix: R3F events work (R3F raycasts its interaction list per object, calling `raycast()`), vanilla works (`intersectObject(sprite)` per §9).

**No scene traversal problem to solve.** `SpriteGroup.add()` already keeps batched sprites out of the scene graph, so nothing does `intersectObjects(scene, true)` over them. Consumers hold refs to the sprites they care about (vanilla) or register handlers (R3F) — both per-object, both the one contract.

**`SpatialGrid` stays as the spec's §7.3 optional acceleration** — built only if profiling shows thousands of simultaneously-interactive sprites, and even then it feeds candidates into the same `raycast()` narrowphase with no public API change. Not in #127.


# Issue #53 — Decisions log

Append entries as decisions are made. Distilled into PR review comments at Phase 8 of the implementation skill.

---

## Renderer class is `Flatland`, not `Renderer2D`
**File:** `minis/driller/src/components/Scene.tsx:3`
**Date:** 2026-05-07

**Decision:** Use `Flatland` from `three-flatland/react` as the sprite-batching renderer wrapper. Mini-game-skill docs reference `Renderer2D` but that class doesn't exist in the current package — `Flatland` is the actual exported class.

**Why:** Plan was authored against an outdated skill reference. Verified by grep against `packages/three-flatland/src/` and confirmed by reading `minis/breakout/src/Game.tsx:9` which uses `Flatland`.

**Evidence:** `minis/breakout/src/Game.tsx`, `packages/three-flatland/src/Flatland.ts`.

## Camera Y inversion at the Flatland boundary
**File:** `minis/driller/src/components/Scene.tsx`
**Date:** 2026-05-07

**Decision:** Game logic uses Y-down (cell row increases downward). Flatland's orthographic camera uses Three's Y-up convention. The Scene component flips the sign once when applying `cam.y` to `flatland.camera.position.y`; everything inside the simulation stays Y-down for clarity.

**Why:** Y-down matches how the player thinks ("digging down" → Y increases). Inverting at the renderer boundary is a single line; doing it everywhere would scatter sign-flip bugs.

## viewSize chosen as `rows * TILE_PX`
**File:** `minis/driller/src/components/Scene.tsx`
**Date:** 2026-05-07

**Decision:** Flatland's `viewSize` (orthographic vertical extent in pixels) = `rows * TILE_PX`. With this, one world unit equals one source pixel; integer pixel scaling at the canvas level (1×/2×/4×/8×) keeps sprites pixel-perfect.

**Why:** Decouples scale from world math. Sprite sizes, positions, and physics are all expressed in source pixels (16 = one tile).

## Atlas regions ship as placeholders; sub-issue #60 measures
**File:** `minis/driller/src/atlas-regions.ts`, `minis/driller/src/materials.ts`
**Date:** 2026-05-07

**Decision:** The atlas region rectangles use plausible-but-unmeasured coordinates. Materials render as solid-color tints (per `TILE_COLORS`) until the regions are dialed in via debug overlay (sub-issue #60).

**Why:** Real measurement requires a debug overlay + iterative pixel-precise measurement against the source PNG, which is a focused 30-60 minute task. Shipping the engine + simulation first lets follow-up phases (collapse, AI, input, death) be implemented and verified independently. Sprite art swaps in cleanly via UV ranges once regions land.

**Evidence:** Sub-issue #60.

## Mood drift uses smooth `lerp(curr, target, 0.05)`; events apply discrete bumps
**File:** `minis/driller/src/systems/ai-mood.ts`
**Date:** 2026-05-07

**Decision:** Two-phase mood update: per-frame `driftMood()` lerps slowly toward a target derived from world signals (gem count, sag, idle time). Discrete events (helpful tap, gem collect, sag overhead, over-pet) apply step changes via `applyMoodEvent()`. The two compose — large events register immediately while drift smooths the long tail.

**Why:** Pure event-driven mood would jitter; pure drift would feel non-reactive. Combining them gives "responsive but not twitchy" — matches spec §7.3's "human flaws emerge from the math" goal.

**Evidence:** `tests/mood.test.ts` covers the drift lerp, all 7 event types, and the moodTarget heuristic.

## Planner selector uses both hysteresis AND sunk-cost commit window
**File:** `minis/driller/src/systems/ai-planner.ts`
**Date:** 2026-05-07

**Decision:** `selectPlanner()` requires the new candidate's mood axis to exceed the current by `MOOD_SWITCH_THRESHOLD=0.1`, AND the previous switch must have been at least `PLAN_COMMIT_TICKS=30` ticks ago. Two gates, not one.

**Why:** Hysteresis alone prevents flicker on slow drift. Commit window alone prevents instant re-switching. Together they encode "the AI has a thought and sticks to it for ~0.5s before reconsidering" — that's the human-flaw model.

## Death pipeline uses module-scoped phase state
**File:** `minis/driller/src/systems/death.ts`
**Date:** 2026-05-07

**Decision:** `deathPhase` and `deathTick` live as module-scoped variables, not in a Koota trait.

**Why:** The death sequence is a singleton state machine that is gated entirely by `GameState.runState === 'dying'`. Adding a trait + entity would be ECS-overhead for a one-shot machine. If we ever need multi-driller (probably never), we'd refactor.

**Tradeoff:** Module state doesn't survive HMR. In practice the death sequence is short (~0.7s), and HMR mid-death is unlikely; if it happens the machine resets cleanly to `idle`.

## Hero-mode world-fall is a depth threshold, not a true biome boundary
**File:** `minis/driller/src/systems/death.ts:heroWorldFallSystem`
**Date:** 2026-05-07

**Decision:** World rotates when `depthM > 250`, hardcoded. No detection of "actually crossed the bottom of the core biome".

**Why:** Simpler. The 250 threshold lives in code where it can be tuned. The biome table's `core.maxDepth = 9999` is a sentinel for "infinite", not a literal world bottom; using a separate constant for "rotate the world" keeps the two concerns separate.

## Sag is a 3-phase state machine, not a 2-phase elapsed-tick decision
**File:** `minis/driller/src/systems/collapse.ts:tickSagging`, `minis/driller/src/constants.ts`
**Date:** 2026-05-08

**Decision:** SaggingChunk lifecycle is now PRECARIOUS (36t / ~600ms) → SAGGING (36t / ~600ms) → SHAKING (24t / ~400ms) → release. Single SaggingChunk entity drives all three phases via elapsed-tick arithmetic; transitions are flag-stamped on the cells (`FLAG_PRECARIOUS / FLAG_SAGGING / FLAG_SHAKING`).

**Why:** The earlier 2-phase budget (700ms total, darken transitions to shake at ~400ms) read as "darken and shake at the same time" because the SAG→SHAKE delta (~200ms p50 verified by `tests/integration/probes/three-phase-timing.probe.js`) sits below the human ~300ms change-detection threshold. Three phases at ≥400ms each give the player perceptibly distinct beats — PRECARIOUS = "this is becoming unstable", SAGGING = "this WILL fall", SHAKING = "fall is happening NOW".

**Why 24-tick SHAKING (not 18):** drill cooldown (180ms) + shallow step (280ms) = 460ms total drill+step. The chunk's first fall-cell impact takes ~100ms after release. With SHAKING=400ms, a player can drill the right block AND step into the new hole 60ms before the chunk lands → narrow escape becomes possible. With 300ms it was physically impossible.

**Evidence:** `tests/integration/three-phase-timing.integration.test.ts` pins each phase to its target ±60ms p50.

## Simulation runs at fixed 60Hz regardless of monitor refresh rate
**File:** `minis/driller/src/components/Scene.tsx`
**Date:** 2026-05-08

**Decision:** Scene.tsx uses an accumulator-based fixed-timestep loop (TICK_HZ=60, MAX_STEPS_PER_FRAME=8) with the simulation extracted into `runSimulationTick()`. Render-side sync (shell setState + camera→Flatland transform) runs once per render frame, decoupled from simulation.

**Why:** The previous per-frame `world.set(GameState, tick+1)` coupled tick rate to refresh rate. On a 120Hz monitor every tick-counted budget (sag, hazard, avalanche) executed at HALF the documented wall-clock duration — sag phase 600ms → 300ms, etc. Live probe verified the new accumulator restores phase timings to within ±60ms of design targets on a 120Hz machine.

## Codex enforcement: shake = real fall by ≥1 cell, anything that falls shook first, shake at most once per incarnation
**File:** `minis/driller/src/systems/collapse.ts`, `minis/driller/src/traits/chunk-traits.ts`
**Date:** 2026-05-08

**Decision:** Three rules govern the soil-side codex:
1. Anything that visually shakes must fall by ≥1 cell. Same-grid-location landing is forbidden.
2. Anything that falls (chunk path) must shake first.
3. A cell shakes at most once per incarnation. PRECARIOUS / SAGGING can re-enter freely; SHAKE is the commit signal.

Enforced via three checks at the SAGGING→SHAKING boundary:
- `sagAllBottomEdgesAir`: ALL bottom-edge cells must have AIR directly below (not "at least one"). The earlier "any" check let through 0-displacement landings when 1 of N bottom edges had non-AIR below.
- `inFlightConflictAbove`: any in-flight FallingChunk in our columns at row ≤ our top row defers our SHAKE (extends `bracedUntilTick` by 6 ticks). Catches the same-tick race where a sibling lands in row+1 between our release and our first physics tick.
- `releaseRow` field on FallingChunk + belt-and-suspenders restore in `landAndReattach`: if landing row equals release row despite the pre-checks, restore cells silently rather than re-stamp at the same grid location.

**Evidence:** `tests/integration/shake-or-stay.integration.test.ts` pins rule 1 via `__drillerStats.zeroDisplacementRestores == 0`; `tests/integration/single-shake.integration.test.ts` pins rule 3 via per-cell shake-edge counting.

## Cascade entity-handoff: JUST_LANDED grace + markCellAndNeighborsDirtyExcept
**File:** `minis/driller/src/systems/collapse.ts:landAndReattach`, `minis/driller/src/systems/autotile-pass.ts`
**Date:** 2026-05-08

**Decision:** When a FallingChunk lands, its cells get `FLAG_JUST_LANDED` set for one detect pass; `detectAndSag` filters JUST_LANDED cells out of the unstable set. The cascade IS propagated (chain reactions are part of the genre): `markCellAndNeighborsDirtyExcept` tags `SAG_RECHECK` on neighboring SOIL cells that are NOT also landed cells.

**Why:** Earlier "no cascade" defense was too restrictive — Mr. Driller's signature is chain reactions. This restores them while breaking the same-tick perpetual loop. The grace flag is cleared at the end of `detectAndSag` so just-settled cells become full participants on the NEXT tick with the standard story (PRECARIOUS → SAGGING → SHAKING → fall).

## Stale chunk entities die at lifecycle boundaries
**File:** `minis/driller/src/systems/collapse.ts`, `minis/driller/src/systems/death.ts`, `minis/driller/src/systems/generation.ts:unloadChunk`
**Date:** 2026-05-08

**Decision:** SaggingChunk and FallingChunk entities die via `clearAllChunkEntities` at death entry, and via `clearChunkEntitiesInRowRange` when a streamed chunk gets unloaded. Plus a per-tick `tickSagging` cull for sag entities whose cells have drifted >SCAN_WINDOW_ROWS_ABOVE above the driller (out-of-play history is anchored).

**Why:** Three real bugs surfaced — death-replay (a chunk that killed the driller kept ticking through respawn), off-screen perpetual shake (entities orphaned by `unloadChunk` re-evaluated against now-AIR rows), off-screen reactivation (a legitimately-spawned sag persisted after the camera scrolled past).

**Evidence:** `tests/integration/offscreen-shake.integration.test.ts` pins the "no shaking blocks more than 18 rows above driller" rule.

## Partial-drill semantics: re-evaluate, don't cancel (option C)
**File:** `minis/driller/src/systems/collapse.ts:tickSagging`
**Date:** 2026-05-08

**Decision:** When the driller drills a cell that's part of an in-progress sag, the surviving cells re-evaluate in place rather than the entire sag canceling:
1. Filter to cells whose grid tile still matches their reserved tile.
2. If survivors still satisfy `sagAllBottomEdgesAir`: shrink the entity, preserve current PRECARIOUS / SAGGING / SHAKING phase. Drilling a non-support → telegraph continues without the drilled cell.
3. If survivors no longer satisfy: cancel. Drilling a support → cells revert to inert SOIL.

**Why:** "Drilling part of an unstable chunk should make MORE of it fall, not less." Predictability for both AI driller and human user. (a) Cancel — wrong, makes drilling DEFUSE the chunk. (b) Force-release — too dramatic, doesn't account for non-load-bearing drills. (c) Re-evaluate — physically correct, predictable, matches genre.

**Evidence:** `tests/no-false-shake.test.ts` "partial-drill of a sag (1 cell) shrinks the chunk and the rest still falls" + sibling "drilling all cells of a sag cancels".

## Rock codex: 4+ initiates, falls as rigid unit, fully resolves once started
**File:** `minis/driller/src/systems/hazard.ts:rockAvalancheSystem`
**Date:** 2026-05-08

**Decision:** Rocks are NOT soil — distinct lifecycle:
1. 4+ connected stones to INITIATE a fall.
2. Fall damages stones (each soil-crush below = +1 hit; ≥4 hits = rock breaks off as a Hazard debris).
3. Cluster falls as a rigid unit, fixed shape per fall step.
4. Once falling, the cluster MUST resolve fully — even when rocks break off mid-flight and survivors drop below 4, the unit keeps falling until it lands.
5. No stop-shake-continue. Rocks resolve fully once started.
6. Inert clusters of any size (including <4) float as supports for soil.
7. Once landed, the cluster goes inert; needs fresh disturbance + 4+ to move again.

Implementation: repurposed `FLAG_FALLING` (was declared but never set) to mark in-motion stone cells. Set on each translate-down; cleared when the cluster blocks. New `inMotion` check at the top of cluster eval bypasses threshold + disturbance gates AND the entire shake telegraph for already-moving clusters.

**Evidence:** `tests/avalanche.test.ts` "in-motion cluster keeps falling even when shrunk below threshold" + "landed cluster requires fresh disturbance to fall again".

## Fixture rule: indestructible permanent shelter
**Date:** 2026-05-08

**Decision:** Fixtures (`TILE_FIXTURE_BASE+0..4`) are mother nature's safe haven. Indestructible by ANY means: drill, fall-crush, avalanche-crush, explosive blast. Block soil falls. Block rock falls.

**Why:** The "third tile type" the codex needs — a guaranteed-safe surface that bounds worst-case collapse scenarios. Rocks plus the planned 4×4 max cap give bounded danger; fixtures give bounded safety. Together they let world-gen produce hard-but-fair scenarios.

**Status:** Locked. Implementation in Plan 1 item A.

## Combined rock decision and 4×4 max cluster cap
**Date:** 2026-05-08

**Decision:** Merge `TILE_ROCK` and `TILE_STONE` into one tile type. Shared rules: 4+ avalanche clusters AND multi-hit health. Drilling = +1 hit, fall-crush = +1 hit, hits ≥ 4 destroys the cell. Cluster bounding box capped at 4 wide × 4 tall (Kirby's-Avalanche-style); once max in either axis, cluster locks and new touching rocks form independent clusters.

**Why:** Three reviewers (art, engineering, designer) converged. Rocks autotile cleanly into deterministic shapes — player predicts cluster behavior visually. Fixtures' artistic variation makes a unified rock-glom visual language hard, so fixtures stay decorative. The 4×4 cap bounds worst-case danger to a recognizable "doom block" — fairness primitive without relying on level-design constraints alone.

**Status:** Locked. Implementation in Phase 2 (G + H + I); placeholder atlas already shipped at `minis/driller/src/assets/rock-autotile.svg`.

## Integration tests via vitexec are evidence-of-completeness alongside unit tests
**File:** `minis/driller/tests/integration/`, `minis/driller/vitest.integration.config.ts`
**Date:** 2026-05-08

**Decision:** Live-browser integration tests using vitexec are required evidence alongside unit tests for any item that touches the simulation pipeline (collapse, hazard, scene loop, tick budgets). Each probe is a browser-runnable JS file that ends with `console.log('INTEGRATION_RESULT: ' + JSON.stringify(result))`; the matching `*.integration.test.ts` parses that with vitest and asserts against the structured result.

Hard rules:
- Probes use `--gpu` (without it headless Chromium throttles RAF and timing-sensitive assertions report ~2× their expected durations).
- Runner enforces a hard timeout (`timeoutSec + 60s`) and SIGKILLs vitexec on overshoot — silence is never green.
- Failure messages MUST name (a) what was expected, (b) likely root causes with file paths, (c) sample offending data, (d) vitexec stdout tail.
- Excluded from default `pnpm test` (slow); run via `pnpm test:integration`.
- Verbose vitest reporter + per-probe progress markers every 10s so a 90s test doesn't look like a hang.

**Why:** Unit tests cover deterministic invariants; the codex enforcement only emerges in full-system play with active AI + streaming chunks + cascading falls. Integration tests caught real bugs unit tests couldn't reach. Game-side counters (`window.__drillerStats`) are the cleanest live signal — grid-state scraping can't distinguish "chunk landed at its release row" (rule-1 violation) from "sibling chunk landed on top of a freshly-released cell" (legitimate).

**Evidence:** `tests/integration/README.md` is the canonical convention doc.

## Plan 1 / item A — fixture indestructibility codified + latent bug fix
**File:** `minis/driller/src/traits/grid-traits.ts`, `src/systems/explosive.ts`, `src/systems/driller.ts`, `src/systems/ai-planner.ts`, `tests/fixture-indestructible.test.ts`
**Date:** 2026-05-08

**Decision:** Promote the implicit fixture-survives rule into a named, testable invariant. Steps:

1. Added `isFixtureTile(t)` to `grid-traits.ts` with the proper bound `[TILE_FIXTURE_BASE, TILE_FIXTURE_BASE+5)`. Doc comment now declares the codex rule explicitly: *"fixtures are mother nature's safe haven — INDESTRUCTIBLE by drill / fall-crush / avalanche-crush / explosive blast."*
2. `explosive.ts` now uses `isFixtureTile(t)` as an explicit early-continue rather than relying on a SOIL/ROCK whitelist accidentally sparing fixtures. Same behavior; intent is unambiguous and grep-friendly.
3. `driller.ts` and `ai-planner.ts` had local `isFixture` helpers using `< TILE_FIXTURE_BASE + 8` — this was a latent bug treating TILE_ROCK (8) and TILE_EXPLOSIVE (9) as fixtures. Both helpers deleted; both files import the canonical `isFixtureTile`. As a side effect, rocks and explosives now correctly classify as drillable / pathable (the multi-hit `completeDrill` path was previously unreachable from `pickAction`).
4. Pinned with `tests/fixture-indestructible.test.ts` (4 cases): explosive blast leaves a fixture cell intact; all 5 fixture variants (+0..+4) survive; STONE within radius also survives (other-anchor sanity); SOIL outside radius is untouched (radius bound sanity).

**Why:** Adjacent latent bug found while auditing fixture handling — fixing it in the same item is cheaper than filing a separate ticket. The codex rule is now codified in code AND test, so a future refactor that broadens the consumed-tiles set will fail the suite immediately. The named helper makes "is this cell consumable?" the same question everywhere.

**Verification:** 102/102 unit tests pass (was 98/98; +4 new). Typecheck clean.

## Plan 1 / item B — glom-fix: avalanche cascade in a single tick
**File:** `minis/driller/src/systems/hazard.ts:529`, `tests/glom-fix.test.ts`
**Date:** 2026-05-08

**Decision:** Mark each newly-translated cluster cell as `seen[newIdx] = 1` immediately after writing the new tile, so the outer flood-fill loop doesn't re-process it as a "new" cluster within the same tick.

**Bug surfaced by writing the codex test:** the falling cluster `[r0..r3]` would commit on tick 31 and translate to `[r1..r4]`. The outer scan continued from i=startIdx upward and re-encountered `r4` (now STONE, not yet `seen`) — flood-fill picked it up as a 1-cell cluster with FLAG_FALLING, and the throttle check `gs.tick - lastAvalancheTick < 12` was false (lastAvalancheTick wasn't bumped until end-of-function), so the system committed AGAIN. Then again. Then again. Result: in a single tick the cluster cascaded down through soil layers, crushing 4+ soil cells and depositing a stone at the world floor with FLAG_FALLING then immediately stripping it via the inMotion+blocked branch. From outside the system the falling cluster *teleported through soil* in one frame.

**Why this fix (vs. alternatives):**
- *snapshot tiles at fn entry*: heavier (Uint8Array clone every tick).
- *bump lastAvalancheTick inline after commit*: would correctly throttle but breaks the design intent that all clusters should commit on the same throttled cadence (multiple independent clusters should still fall together).
- *flood-fill all clusters before any mutation*: correct but a larger refactor; deferred until the Phase 2 RockCluster entities work, which already requires a two-pass restructure.

**Why this matters for the codex:**
- Rule 5 ("rocks resolve fully once started, no stop-shake-continue") is now actually observable in unit tests — previously it was being honored *too aggressively* via the cascade bug.
- Rule 4 ("survivors keep falling until they land") now works because the cluster is treated as one cluster that grows via flood-fill across ticks. The merged cluster (falling + static stone it lands on) keeps falling at the throttled cadence — single cell, grows to 5, falls together.

**Tests pinning the rule:**
- `glom-fix.test.ts: falling 4-cluster lands on a static stone above SOIL → merged cluster keeps falling` — observes `everSawMerge` (5 simultaneous FLAG_FALLING cells) and the cluster ending up below the original static row.
- `glom-fix.test.ts: ... no support → merged cluster lands inert` — pins rule 7 (FLAG_DISTURBED clears on landing inert).

**Verification:** 104/104 unit tests pass (was 102/102; +2 new). All existing avalanche tests still pass; typecheck clean.

## Plan 1 / item C — mouse-brace extends to shaking rock clusters
**File:** `minis/driller/src/systems/hazard.ts:braceShakingCluster`, `src/systems/input.ts`, `src/constants.ts`, `tests/rock-brace.test.ts`
**Date:** 2026-05-08

**Decision:** Add `braceShakingCluster(world, col, row, extendTicks)` exported from `hazard.ts`. It flood-fills the cluster from the seed and bumps every cell's `shakeStartTick` forward by `extendTicks`, which delays the per-tick `earliestShake = min` and extends the telegraph by exactly that many ticks before the cluster commits.

`input.ts` `resolveHoverAction` now returns `'brace'` for `TILE_STONE && FLAG_SHAKING && !FLAG_FALLING`. `doBrace` falls back to `braceShakingCluster` when no `SaggingChunk` is found at the hover cell. The 1-gem cost is the same as the soil brace.

**Why a separate function rather than re-using SaggingChunk's bracedUntilTick pattern:** rocks don't have persistent cluster entities — they're flood-filled per tick. A bracedUntil signal would have to be stored on the cells (the `Grid.flags` Uint8Array) which we'd have to allocate a new flag for. Bumping `shakeStartTick` reuses existing state and the existing min-over-cluster pulse logic; the brace effect is automatically scoped to the SHAKING phase.

**Codex compliance:**
- Rule 5 enforced — in-motion (FLAG_FALLING) clusters refuse the brace. The function early-returns false at the FALLING check.
- The brace is consumable: the gem cost is deducted only on success. Repeated tap on the same cluster works, but each tap costs a gem.

**Constants:**
- `ROCK_BRACE_EXTEND_TICKS = 30` (one full telegraph window, ~500ms) — matches AVALANCHE_SHAKE_TICKS + AVALANCHE_SETTLE_TICKS = 24 + 6.

**Tests pinning the rule:**
- `rock-brace.test.ts: braces a shaking 4-cluster — delays the cluster commit` — observes the cluster still at row 0 after 30 ticks past the brace point (without brace it would have committed).
- `... refuses to brace an in-motion cluster (codex rule 5)`.
- `... refuses to brace a non-shaking, non-falling stone cell` (the cell is just a static stone).
- `... refuses to brace an AIR cell`.

**Verification:** 108/108 unit tests pass (was 104/104; +4 new). Typecheck clean.

## Plan 1 / item D — AI evades in-motion / shaking stone clusters
**File:** `minis/driller/src/systems/ai-planner.ts:planEvadeMovingStoneCluster`, `tests/evade-stones.test.ts`
**Date:** 2026-05-08

**Decision:** Mirror `planEvadeFallingChunk` for stones. The new `planEvadeMovingStoneCluster` scans grid cells in a window above the driller (winTop = max(0, driller.row − 32), winBot = driller.row + 1) for `TILE_STONE && (FLAG_FALLING || FLAG_SHAKING)`. Each such cell contributes its column ± 1 to a `threatenedCols` set. Driller is in danger iff `threatenedCols.has(driller.col)`. Search outward for the closest passable safe column (skip stone/rock/fixture cells), return as next step.

**Why per-cell, not per-cluster:** rocks have no entity representation — the canonical state is on the grid bits. A cell-level scan captures both shaking telegraphs and in-motion clusters in one pass. Bounded window (32 rows up) avoids O(rows·cols) — at MAX_REACH=10 there are at most ~300 cells in the window for an 18-col grid.

**Why ±1 col halo:** matches the existing `planEvadeHazard` and `planEvadeFallingChunk` patterns. A rock at col 6 shaking → cols {5, 6, 7} are threatened. A driller standing at col 5 still has a falling debris fragment risk (rock break-off can scatter sideways).

**Wired into plannerTick:** evade priority is now `planEvadeFallingChunk` → `planEvadeMovingStoneCluster` → `planEvadeHazard`. Soil chunks first because they cover more area; stone clusters second; ambient hazards last (rocks falling from offscreen).

**Tests pinning the rule:**
- `evade-stones.test.ts: returns null when no rock cluster is in motion or shaking`
- `... returns a side-step when a SHAKING cluster is directly above`
- `... returns a side-step when a FALLING cluster is directly above`
- `... ignores clusters BELOW the driller (already past)`
- `... halos to ±1 column — cluster 1 col over still threatens`
- `... returns null when driller is well away`

**Verification:** 114/114 unit tests pass (was 108/108; +6 new). Typecheck clean.

## Plan 1 / item E — drill / sag-release / explosion / hazard land disturbs adjacent stones
**File:** `minis/driller/src/systems/autotile-pass.ts:markCellAndNeighborsDirty`, `:markCellAndNeighborsDirtyExcept`
**Date:** 2026-05-08

**Decision:** Extend the support-topology dirty-marker functions to set `FLAG_DISTURBED` on 4-neighbor `TILE_STONE` cells, in addition to the existing `FLAG_SAG_RECHECK` on 4-neighbor `TILE_SOIL` cells.

**Bug this fixes:** world-gen rock piles never fall unless a hazard happens to land DIRECTLY adjacent to one. Drilling adjacent to a 4-stack does nothing — the stones don't get FLAG_DISTURBED, so the avalanche disturbance gate refuses to initiate the fall. From the player's perspective, "I drilled the support next to this rock pile and nothing happened" feels broken.

**Why now:** the canonical "destabilizing event" set is captured in the existing comment on `markCellAndNeighborsDirty`: "PLAYER-driven mutations (drilling, hazard land, explosion)". Sag-release is a downstream effect (chain reactions through `…Except`). All four use the same dirty-marker. Extending the marker to disturb stones in addition to soil is the smallest change that captures every destabilizing event.

**Side cleanup:** Removed the duplicate `disturbAdjacentStones` helper from `driller.ts` — it did exactly the same work in `completeDrill` after `markCellAndNeighborsDirty`. With the extension, the second call is redundant.

**Tests pinning the rule:**
- `disturb-stones.test.ts: drilled cell sets FLAG_DISTURBED on adjacent TILE_STONE`
- `... sets FLAG_SAG_RECHECK on adjacent TILE_SOIL (existing behavior, regression guard)`
- `… the Except variant also disturbs adjacent stones`
- `… the Except variant respects the exclude set`
- `… non-stone non-soil neighbors (fixture, AIR) are untouched`

**Verification:** 119/119 unit tests pass (was 114/114; +5 new). Typecheck clean.

## Plan 1 / item F — fixture placeholder amber tint
**File:** `minis/driller/src/components/TileRenderer.tsx`, `src/materials.ts`
**Date:** 2026-05-08

**Decision:** Collapse the three placeholder fixture tints (bone, mushroom, crystal) into a single unified amber `TINT_FIXTURE = [0.88, 0.74, 0.40]`. All five fixture variants (`TILE_FIXTURE_BASE+0..+4`) render with this color until per-variant sprites land with the proper art pass.

**Why:** the code wasn't really showing three distinct fixtures — variants 2-4 were all rendering as `TINT_FIXTURE_CRYSTAL` (the "else" branch of the bone/mushroom/crystal switch), and the bone color (`[0.91, 0.90, 0.83]`) blended too easily with deep biome soils. The unified amber gives fixtures a single instantly-recognizable visual identity ("mother nature's safe haven"), distinct from biome palettes (browns/greens/purples), rocks (gray-tan), and explosives (red).

**Side cleanup:** the renderer's fixture range check was using the off-by-3 `< TILE_FIXTURE_BASE + 8` pattern (same latent bug item A fixed in driller.ts and ai-planner.ts — would mis-classify TILE_ROCK and TILE_EXPLOSIVE as fixtures). Replaced with the canonical `isFixtureTile` helper. Also dropped the obsolete `fixtureBone / fixtureMushroom / fixtureCrystal` keys from `TILE_COLORS` in `materials.ts`; replaced with a single `fixture` key.

**Verification:** 119/119 unit tests pass; typecheck clean. Visual check deferred — placeholder hue change has no behavioral consequences and the integration suite doesn't gate on render output.

## Phase 2 / item G — TILE_ROCK + TILE_STONE unification
**File:** `minis/driller/src/traits/grid-traits.ts`, `src/constants.ts`, `src/systems/driller.ts`, `src/systems/hazard.ts`, `src/systems/explosive.ts`, `src/systems/ai-planner.ts`, `src/systems/generation.ts`, `src/components/TileRenderer.tsx`, `tests/_world-helper.ts`, `tests/unified-stone.test.ts`
**Date:** 2026-05-08

**Decision:** Drop `TILE_ROCK` (was id=8) entirely; promote `TILE_STONE` (id=2) to be the unified hard-tile class. All stones track damage in `Grid.hits[idx]` (= hits TAKEN, not lives remaining), break at `>= STONE_MAX_HITS`. Worldgen "speed-bump" stones spawn pre-damaged at `STONE_MAX_HITS - 1` so they break in one drill — preserving the prior TILE_ROCK gameplay feel via initial state, not via tile class.

**Why these specifics:**

1. **Inverted hits semantics.** Pre-unification, `driller.ts` used hits as "lives remaining" (decrement on drill, break at 0) while `hazard.ts` used hits as "damage taken" (increment on soil-crush, break at 4). They never collided because rock-drill and stone-cluster were disjoint paths. Phase 2 G makes them share the field, so they MUST share the convention. Damage-taken is cleaner: fresh = 0 (matches Uint8Array default, no init needed), broken = MAX. Inverting was free here.
2. **One tuning knob.** `STONE_MAX_HITS = 4` is shared by drill (`completeDrill`) and avalanche break-off (`AVALANCHE_HITS_TO_BREAK`). Pre-unification these were `ROCK_HITS = 3` (drill) and `4` (avalanche). Now they match — tuning either changes both.
3. **Stones are drillable.** `pickAction` no longer idles on a stone neighbor; the driller drills any non-fixture, non-AIR cell. Codex implication ("driller can drill a 1hp rock to save themselves") is now expressible — pre-damaged speed-bump stones are 1 drill from breaking.
4. **Stones survive explosions.** Pre-unification rocks vaporized in blasts and stones survived. Unification could have gone either way; chose "stones survive" because the design intent (per `decisions.md` rock-codex entry) is that explosions only ADD hits via fall-crush adjacency, not via blast directly. Drill + fall-crush remain the only ways to damage stones.
5. **Worldgen contract.** `GeneratedChunk` gained `damagedStones: number[]` so the chunk-copier in `loadChunk` knows which stone cells need pre-damage. Keeping the speed-bump signal in the generated structure (vs. encoding "damaged" in the tile class) means a stone+0 hits and a stone+3 hits are the same tile — only the `Grid.hits` payload distinguishes them.
6. **Visual feedback.** New `TINT_DAMAGED_STONE` (= old `TINT_ROCK`) tints any stone with hits > 0 so the player sees "drillable / cracked" at a glance. The proper art pass introduces a 4-frame damage progression; this is the placeholder.

**Tests pinning the rule:**
- `unified-stone.test.ts: a fresh stone (hits=0) takes STONE_MAX_HITS drills to break`
- `... a pre-damaged stone (R in helper) breaks in a single drill`
- `... an isolated fresh stone over AIR does NOT fall (sub-threshold cluster, regression guard)`
- `fixture-indestructible.test.ts` updated: stone (was TILE_ROCK, now damaged TILE_STONE) survives the blast — pinning the new explosion behavior.
- `generation.test.ts` updated: the "stone scatter" assertion now reads `c.damagedStones` for the speed-bump count instead of TILE_ROCK count.
- All 18 prior test files unchanged still pass — the unification didn't break codex invariants.

**Verification:** 122/122 unit tests pass (was 119/119; +3 new in `unified-stone.test.ts`). Typecheck clean.

## User-action skill reform — Phase 1 (pet)
**File:** `minis/driller/src/{traits/driller-traits.ts,constants.ts,systems/driller.ts,systems/input.ts}`, `tests/pet.test.ts`
**Date:** 2026-05-12

**Decision:** Petting is no longer a free mood interaction — it costs 1 gem, pauses the driller for `PET_PAUSE_TICKS=60` (~1s @ 60Hz), and over-pet (>3 pets in `OVER_PET_WINDOW_TICKS`) flips fear UP and INSTANTLY clears the pause so the driller bolts.

**Why:**
1. **Gem cost matters because petting is a player choice that should compete with other spends** (shake, paint, drag). Without a cost the player would just spam-pet for the trust bump, neutralizing the over-pet flaw entirely.
2. **Pause via `Driller.pausedUntilTick` rather than an `Animation: 'paused'` state.** The motion system already runs every tick — gating the entire budget loop with a single early-return is simpler than threading an explicit paused state through every action-picker branch. The animation system holds idle naturally because the planner never advances destCol/destRow.
3. **Over-pet "flee" emerges from the existing mood system** — `applyMoodEvent('over-pet')` already bumps fear, and the cautious planner takes over at high fear. No dedicated flee state; the unpause + fear-spike produces visibly different behavior in-game because the planner immediately routes via cautious BFS.
4. **Pause refresh, not stack.** Each pet sets pausedUntilTick = gs.tick + PET_PAUSE_TICKS — second tap during the pause extends it from "now" rather than queuing additional time. Matches the user mental model: pets feel continuous.

**Tests pinning the rule:** `tests/pet.test.ts` covers (a) pause-and-deduct, (b) no-gem refusal, (c) over-pet instant unpause + fear spike, (d) tap-during-pause refreshes the timer.

## User-action skill reform — Phase 2 (shake)
**File:** `minis/driller/src/{traits/input-traits.ts,constants.ts,systems/input.ts,Game.tsx}`, `tests/shake-action.test.ts`
**Date:** 2026-05-12

**Decision:** Added a deliberate-gesture `shake` action: while the pointer is held over a stable TILE_STONE cell, accumulated raw pixel travel exceeds `WIGGLE_THRESHOLD_PX=80` → commit. Costs `SHAKE_COST=1` gem. Every stone sharing a cluster id with the wiggled cell gets `FLAG_FALLING` (clears `FLAG_SHAKING`). The wiggle IS the telegraph — the rock skips the normal shake/settle pipeline and enters falling immediately.

**Why:**
1. **Path-distance threshold over click-count or hold-duration.** "Use clicks and gives their mouse/finger a wiggle" maps best to actual pointer motion, not a multi-tap. Path-distance is direction-agnostic (works for circular wiggles, back-and-forth, vertical) and naturally filters accidental clicks (no motion → no shake). 80px is roughly 4-5 tile widths in canvas space — too big to be incidental, small enough to feel responsive.
2. **Cluster cascade is automatic.** Same mechanic as the bomb cascade from `detonate`: walk the grid, set FLAG_FALLING on every cell sharing the cluster id. Reuses the avalanche system's `inMotion` path so falling resolves without any new code.
3. **Solo stones (clusterId === 0) only drop the clicked cell.** A speed-bump damaged stone isn't part of a cluster; cascade-by-id would no-op. Special-case the single cell so the action still works on solo rocks.
4. **`Pointer.wiggleCol/Row/Distance` lives on the trait, not in Game.tsx component state.** Pointer is a singleton world trait already; the wiggle session is naturally pointer-scoped state. Resetting on hover-cell-change or pointer-up is one set-trait call.
5. **Single-click on a shake-hover cell is a no-op.** The pointerup → handleClick path explicitly skips `commitAction` for `action === 'shake'` so accidental clicks (no motion) don't drop the rock. The wiggle is the entry point.

**Tests pinning the rule:** `tests/shake-action.test.ts` covers (a) cluster-wide FLAG_FALLING + gem deduction, (b) no-gem refusal, (c) non-stone hover refusal, (d) in-motion stone refusal (no double-fire on already-falling clusters).

## User-action skill reform — Phase 3 (gem time-pressure)
**File:** `minis/driller/src/{traits/gem-traits.ts,constants.ts,systems/{driller.ts,input.ts,gem-expiry.ts},components/{Scene.tsx,GemRenderer.tsx}}`, `tests/gem-expiry.test.ts`
**Date:** 2026-05-12

**Decision:** Gems now have an expiry timer. When the row a gem sits on is mutated (drill via `completeDrill` OR paint via `doPaint`), `Gem.expireAtTick` arms to `gs.tick + GEM_FADE_TICKS=180` (~3s @ 60Hz). At that tick the gem self-destroys. Visual: the renderer reads the expiry against the window to play an ease-in grow (0..0.3) then elastic-snap shrink + alpha fade (0.3..1.0) — sin-wave wobble overshoots zero to feel snappy. Void-band gems are exempt (their free-fall lifecycle handles them).

**Why:**
1. **Row-mutation is the natural exposure event.** A gem buried in soil is hidden; the moment you drill or paint that row you've seen it. Starting the timer on exposure (rather than on every drill click globally, or on driller proximity) ties the pressure to "you uncovered this gem, now grab it." Trivially testable: the gem's row vs the mutated row, an integer comparison.
2. **Single fixed window across all gems.** Considered scaling fade time with gem size or biome depth; rejected because the player builds intuition fastest when one number applies everywhere. The render-time elastic-snap visual carries the size-difference signal (larger gems read more "pop" purely from their base size).
3. **Paint arming inside `doPaint`, drill arming inside `completeDrill`.** Both row-mutation paths arm the timer at the source, so any future "row mutation" pathway (a future explosion that aerates a row, say) needs one line added there — not in a central exposure broker.
4. **`gemExpirySystem` runs unconditionally per tick.** Not gated on `runState === 'playing'` because gems shouldn't reset if the player pauses; once armed, the countdown is committed. Cheap query (gems with `expireAtTick > 0`).
5. **Don't re-arm.** Paint-twice on the same row keeps the original deadline — the gem is exposed once, not progressively-more-exposed. Tested explicitly so a refactor can't accidentally extend the window.
6. **Fade visual runs in parallel with the existing off-top death tween.** Both compute a scale/alpha; the renderer takes whichever is MORE faded (min of both). A gem leaving the camera while expire-fading visually composes correctly without a phase ordering.

**Tests pinning the rule:** `tests/gem-expiry.test.ts` covers (a) destroyed at expiry, (b) un-armed gems untouched, (c) paint arms expiry, (d) paint on different row doesn't arm, (e) no re-arm on second paint.

## User-action skill reform — Phase 4 (paint replaces trigger)
**File:** `minis/driller/src/{traits/input-traits.ts,constants.ts,systems/{input.ts,driller.ts},components/Scene.tsx}`, `tests/paint-action.test.ts`
**Date:** 2026-05-12

**Decision:** The old `trigger` action (single click on soil-above-driller → spawn SaggingChunk outright) is replaced by `paint`. Hover over ANY soil cell → 'paint' action. Click-and-hold accelerates the cell's `Grid.anchorDist` by `PAINT_ANCHOR_BUMP=16` per game tick at `PAINT_COST_PER_TICK=1` gem each. The existing sag detector picks up the bumped cells naturally and produces a normal SHAKE → FALL chunk — paint doesn't bypass any pipeline, just accelerates entry.

**Why:**
1. **Reuse anchor-distance, don't carry separate "paint progress".** The sag detector already gates on anchorDist crossing a threshold. Bumping anchorDist from outside is the cheapest possible inversion of the existing collapse plumbing; no new field, no new system to drive collapse from paint.
2. **Per-tick re-resolution in `pointerHeldTick`.** The held-pointer loop re-runs `resolveHoverAction` each tick. The first paint that pushes a cell into FLAG_SAGGING causes the next tick's resolveHoverAction to return `'drag'` (the now-shaking chunk is grabbable). Without re-resolution, a held button would keep charging paint costs forever even after the chunk left the soft state.
3. **Mood event still fires per tick.** Each paint commit applies the `evil-tap` mood event, so a sustained paint mounts continuous fear pressure on the driller. The previous `trigger` only fired once; paint's continuous flavor matches the new "ongoing harassment, not one-shot" intent.
4. **Legacy `'trigger'` alias preserved.** `commitAction('trigger', null)` now routes to `doPaint`. Saves churn on any existing test/UI that still names the old action — they get the new behavior with no code change.
5. **Paint anywhere, not just above driller.** The old trigger only allowed clicks on soil ABOVE the driller (so it could fall on him). Paint has no such restriction — the player can soften any soil cell anywhere. With the new hold-and-drag (phase 5), painting below to weaken a floor or sideways to expose a hidden gem are both legitimate uses.

**Tests pinning the rule:** `tests/paint-action.test.ts` covers (a) anchor bump + gem deduction, (b) non-soil refusal, (c) no-gem refusal, (d) anchor cap at 255, (e) held-tick re-fires paint, (f) inactive pointer is a no-op.

## User-action skill reform — Phase 5 (hold-and-drag) + mid-stream tweaks
**File:** `minis/driller/src/{traits/{input-traits.ts,driller-traits.ts},systems/{drag.ts,input.ts,driller.ts,hazard.ts},world.ts,components/Scene.tsx,Game.tsx,constants.ts}`, `tests/{drag-action.test.ts,paint-action.test.ts,pet.test.ts,gem-expiry.test.ts,freefall-collect.test.ts}`
**Date:** 2026-05-12

**Decision:** Hold-and-drag is a per-tick system that physically translates a STONE CLUSTER while the pointer is held over any cell in it. Gravity is paused (FLAG_FALLING/FLAG_SHAKING cleared) at grab time; the cluster cells move as a rigid block when the pointer cell shifts, gated on collision (every target must be AIR or already part of the cluster). Cost ramps per `DRAG_COST_INTERVAL_TICKS=60` (~1s): tick N bills `1 + N * DRAG_COST_SCALE_PER_INTERVAL` gems, so 5s of holding = 15 gems total. Insolvency auto-releases. Pointer-up restores FLAG_FALLING so the avalanche resumes from wherever the drag ended.

Soil chunk drag (SaggingChunk entities) explicitly deferred for now — the chunk lifecycle has its own translation logic in collapse.ts; bolting drag onto that is a larger surface change. Stone-cluster drag is the primary use case (post-bomb cascades, post-shake clusters), and ships.

**Why:**
1. **Pause-by-flag-clear, restore-by-flag-set.** Stones with FLAG_FALLING are visible to the avalanche system; clearing the flag silently removes them from gravity processing without a new "is-dragged" predicate. Restoring on release re-enters them with no special path.
2. **Atomic snapshot move.** Translating the cluster naively (write target before clearing source) corrupts cells that move into a position another cluster cell was vacating. Two-pass — capture all source tile/flag/hits/cid into a snapshot, clear all sources, write all targets — avoids any intermediate state where the cluster looks malformed.
3. **Anchor follows the cluster.** `Drag.anchorCol/Row` updates on every successful translation, not just at grab. The pointer-to-cluster offset is relative to the LAST valid position, so the player drags incrementally instead of jumping all at once when they move far.
4. **Cost-ramp via summed-interval bills.** Each tick the system checks `intervalsNow > intervalsCharged`; if so, sums the costs of newly-crossed intervals and bills in one `world.set`. Cheap; one allocation; resilient to tick coalescing (a frame that crosses 3 intervals at once still pays all 3).

**Coupled mid-stream tweaks landed in the same commit:**

A. **Gem value scales by size.** `doCollect` now adds `GEM_VALUE[gem.size]` (`small=1, medium=3, large=5, huge=10`) instead of a flat 1. Huge gems are the jackpot find.

B. **Gem collect cooldown during gameplay.** `Pointer.collectCooldownUntilTick` gates successive collects to `GEM_COLLECT_COOLDOWN_TICKS=12` (~0.2s @ 60Hz). Bypassed in the void band (the bonus zone is intentionally a click-frenzy). Prevents auto-clicker farming under the new time-pressure rules.

C. **Pet defers pause while airborne.** Petting mid-fall doesn't levitate the driller. `doPet` checks `tiles[supportRow][col]` for ground; if airborne, sets `Driller.petPauseQueuedTicks` instead of `pausedUntilTick`. The driller motion system converts the queue to an active pause the first tick after landing.

D. **Rock-on-head always kills.** The `onGround` gate inside `hazardTickSystem`'s landing-kill check is gone — if the rock's rest cell equals the driller's cell, runState flips to 'dying' regardless of fall state. The previous gate let the driller dodge a rock by being mid-air through the landing tick (related to the "play chicken" dance fix); now the kill is unconditional.

E. **Paint pivot: destroy, don't weaken.** The anchor-bump version (1 gem per tick, +16 to anchorDist, slow collapse) felt unresponsive. New rule: `doPaint` instantly converts SOIL → AIR for 1 gem per tick. Held-pointer drag carves a hole as wide as the player can afford. Overhangs that result trip the existing sag detector on the next relaxation tick.

**Tests pinning the rules:** `tests/drag-action.test.ts` (7 cases: grab, cluster-id capture, gravity-pause, translate, collision-rejection, release-rearm, cost-bill-and-release, auto-release). `tests/gem-expiry.test.ts` extended with the size-value matrix (1/3/5/10). `tests/freefall-collect.test.ts` updated for the new medium=3 value. `tests/pet.test.ts` extended with the airborne-queue case. `tests/paint-action.test.ts` rewritten for the destroy-instead-of-weaken semantics.

## Phase summary (all 5 phases shipped 2026-05-12)
176/176 unit tests pass, typecheck clean. ActionKind = `'none' | 'collect' | 'brace' | 'trigger' | 'pet' | 'shake' | 'paint' | 'drag'` — `'trigger'` retained as a legacy alias for `'paint'`. New constants in `constants.ts` (PET_COST, PET_PAUSE_TICKS, SHAKE_COST, WIGGLE_THRESHOLD_PX, PAINT_COST_PER_TICK, GEM_FADE_TICKS, GEM_COLLECT_COOLDOWN_TICKS, DRAG_COST_*) are the player-facing tuning surface — visible at a glance and easy to adjust without touching mechanics.

## User-action skill reform — Phase 5 follow-up (mode mutex + cursor-coupled shake)
**File:** `minis/driller/src/{traits/input-traits.ts,systems/input.ts,Game.tsx,components/TileRenderer.tsx,world.ts}`, `tests/paint-action.test.ts`
**Date:** 2026-05-12

**Decision A — Mode mutex.** `Pointer.lockedAction` captures the resolved hover action at pointerdown and `pointerHeldTick` refuses to fire any action OTHER than the locked one. Clicking a rock then dragging onto soil no longer silently consumes paint; clicking soil and crossing a rock no longer triggers shake. Modes are strictly press-bound — release and click again to switch.

**Decision B — Cursor-coupled shake visual.** On pointerdown over a stable rock, the cluster gets `FLAG_SHAKING` stamped immediately (instant visual feedback). The TileRenderer now distinguishes "shake from avalanche" (canned 6Hz sin wobble) from "shake from active wiggle gesture" (cursor-velocity-driven amplitude at 14Hz, max 3px). `Pointer.wiggleVelocity` accumulates raw cursor motion on pointermove (`+dist * 0.08`, clamped at 1.0) and decays each render frame (`*= 0.85`). Still cursor = settled rock; fast wiggle = big visible wobble. Release without crossing the wiggle distance threshold clears `FLAG_SHAKING` so the rock settles back.

**Why:**
1. **Lock at pointerdown, not at first commit.** Resolving the action on every held-tick (the previous behavior) means a cursor crossing cells silently switches modes. The locked action makes the press-and-hold a single atomic interaction.
2. **Per-cluster wiggle amplitude via `wiggleClusterId`.** Captured at pointerdown from the clicked stone's `clusterId`. The renderer checks `clusterId[idx] === wiggleClusterId` to gate the cursor-coupled wobble — so OTHER shaking clusters (avalanche-triggered) keep the canned 6Hz visual. Visual provenance preserved.
3. **Decay velocity in the renderer's useFrame, not in a system.** The render frame is the natural cadence for visual smoothing — runs at display rate, not tick rate. Avoids a separate "wiggle velocity tick" system.
4. **The wiggle distance threshold stays the trigger.** Visual coupling is decoupled from the commit gate — the rock falls once the player has accumulated WIGGLE_THRESHOLD_PX of cursor travel. The cursor-coupled wobble is just feedback; it doesn't change WHEN the rock falls.
5. **Restoring on release.** If the player releases before crossing the threshold, the cluster's FLAG_SHAKING is cleared so the rock visually settles back. FLAG_FALLING is left alone in case the threshold was already crossed and the cluster is now committed.

**Tests pinning the rule:** `tests/paint-action.test.ts` extended with the mode-mutex case: `lockedAction='shake'` over a paint-resolved soil cell, `pointerHeldTick` must NOT fire paint. Existing paint tests updated to include `lockedAction='paint'` so they exercise the gated path. 177/177 total pass.

## User-action skill reform — Phase 6 (shake removed)
**File:** `minis/driller/src/{traits/input-traits.ts,constants.ts,systems/input.ts,Game.tsx,components/TileRenderer.tsx,world.ts}`, deleted `tests/shake-action.test.ts`, updated `tests/paint-action.test.ts`
**Date:** 2026-05-12

**Decision:** Remove the `shake` action entirely. Paint already produces the same gameplay outcome (destroy soil → rock falls) for the same gem cost, so shake had no unique value worth its own mode + wiggle gesture + cursor-coupled visual.

**Why:**
1. **Redundancy with paint.** Both ended with "rock falls"; paint reaches the rock's support via destroying the soil below; shake reached it via cluster cascade. Same gems, same result, paint also works on rocks supported by other rocks (the cluster cascade carries through). Shake was strictly a subset.
2. **Mode mutex stayed useful even without shake.** `Pointer.lockedAction` still prevents paint/drag mode switching mid-press. Updated the mutex regression test from `lockedAction='shake'` to `lockedAction='drag'` — the gate is identical, the example is what changed.
3. **Renderer simplification.** TileRenderer's shake jitter dropped its cursor-coupled branch (wiggle cluster id + velocity); shake is again a single canned 6Hz wobble from the avalanche pipeline.
4. **Constants dropped:** `SHAKE_COST`, `WIGGLE_THRESHOLD_PX`. Pointer trait dropped `wiggleCol`, `wiggleRow`, `wiggleDistance`, `wiggleClusterId`, `wiggleVelocity`. ActionKind dropped `'shake'`.
5. **No follow-up needed.** This is a strict deletion — no replacement mechanic, no migration. The user's instinct ("my bad, paint covers it") was the simplification.

**Tests:** `tests/shake-action.test.ts` deleted. 172/172 total pass (was 177; -5 shake tests).

## User-action skill reform — Phase 7 (hover priority + gem halo)
**File:** `minis/driller/src/{systems/input.ts,Game.tsx}`, `tests/hover-priority.test.ts`
**Date:** 2026-05-12

**Decision:** Reordered `resolveHoverAction` to explicit priority + added a ±1 cell Chebyshev halo for gem touch targets. While a drag is in progress, every hover resolves to `'drag'` and the pointerup click-commit is skipped (drag's intentional release shouldn't suddenly fire collect/pet/paint on the cursor's resting cell).

**Priority (high → low):**
1. Active drag (any cell → 'drag')
2. Gem (exact-cell OR ±1 halo)
3. Pet (driller's exact cell)
4. Drag (this cell is currently SHAKING/FALLING)
5. Brace (sagging soil)
6. Paint (any soil)
7. None

**Why:**
1. **Gems are the time-pressured target.** Under the new fade timer, a missed click on a fading gem is a real loss. Sticking gem priority above pet (and adding a halo) makes the touch interaction forgiving without changing other mechanics.
2. **Halo is Chebyshev 1 (3×3 around the cursor cell).** Bigger halos start false-positive into adjacent gem territory; ±1 covers a fingertip-sized error region for a single-cell gem.
3. **Exact-cell match wins over halo match.** The resolver tracks the minimum Chebyshev distance across all gems and picks the closest, so dropping a click ON a gem still selects THAT gem, even when a neighbor gem is in halo range.
4. **Active drag is the topmost gate.** Without it, mid-drag pointermove could surface a "collect"/"paint" hoverAction, which is a misleading UI cue. With it, the cursor always shows "drag" while you're dragging.
5. **Skip the click-commit on drag release.** `endDrag` runs, then `handleClick` is skipped — otherwise a release over a gem cell would auto-collect (free gem after paid drag) or over soil would fire a stray paint commit.
6. **Free-fall branch unchanged.** The void band already had its own "nearest gem anywhere, no halo limit" logic; the new halo applies only to the gameplay branch.

**Tests pinning the rule:** `tests/hover-priority.test.ts` covers (a) active drag overrides every cell, (b) exact-cell gem beats pet, (c) halo collect on ±1 cell, (d) halo does NOT extend past Chebyshev 1, (e) exact-cell gem wins over halo neighbor, (f) pet beats paint when no gem nearby, (g) paint as fallback. 179/179 total pass.

## In-canvas feedback HUD — Phase 1 (bake-icons CLI)
**File:** `scripts/bake-icons.ts`, `package.json` (script entry), `minis/driller/src/generated/{icons,digits}.{png,ts}` (committed sheets)
**Date:** 2026-05-12

**Decision:** Glyph→pixel-sprite-sheet baking is a standalone CLI driven by Playwright (no native deps). Takes a list of `name=glyph` pairs, renders each in a headless Chromium canvas at `renderSize` (default 64), box-average downsamples to `size` (default 8), packs into a single PNG with `padding` (default 1) transparent pixels between cells. Emits `{out}.png` + `{out}.ts` (regions table + sheet dims).

**Why Playwright over node-canvas/@napi-rs/canvas:**
1. **Zero new native deps.** `@playwright/test` is already a workspace devDep. No additional install / no postinstall surprises on CI.
2. **Browser-side rendering matches what users see.** System emoji fonts vary; rendering in Chromium gives us the same rasterization end users would get from a runtime canvas approach — but pre-baked and committed for determinism.
3. **The entire sheet assembly lives in one `page.evaluate` block.** Single shot: render → downsample → blit → toDataURL, returns base64 PNG to Node, which writes the file. No multi-pass orchestration, no per-glyph round-trips.

**Pipeline choices:**
- **Box-average downsample** (not nearest-neighbor): the source emoji is anti-aliased; averaging each `block × block` region produces clean small-pixel sprites without harsh aliasing.
- **One row of cells**, sheet width = next-power-of-two of `cells × stride`. Predictable layout; the `regions.ts` `x/y/w/h` table is the source of truth for UV math at runtime.
- **`--render-size` flag** so digits (typically thinner than emoji) can use a smaller source canvas (48 vs 64) — less anti-aliased material to average over → crisper digit edges.
- **`--font` per invocation, one sheet per font.** Emojis bake with `"Apple Color Emoji"`; digits bake with `"Menlo"`. Run twice, two output files. Simpler than multi-font sheets.

**Generated assets:**
- `minis/driller/src/generated/icons.png` (128×16): `drag, paint, brace, pet.happy, pet.neutral, pet.angry, timer, gem`
- `minis/driller/src/generated/digits.png` (128×8): `0–9, minus, plus, m`
- Both sheets + their regions TS files committed. Re-bake with `pnpm bake-icons …`.

**Verification:** baked both sheets, inspected output PNGs (legible emojis at 8×8, legible digits at 6×6). The regions TS files round-trip through TypeScript (`pnpm typecheck` will catch them in subsequent phases when consumed).

## In-canvas feedback HUD — Phase 2 (hover-target outline)
**File:** `minis/driller/src/{materials.ts,components/{HoverOutlineRenderer.tsx,Scene.tsx}}`
**Date:** 2026-05-12

**Decision:** A pool of 64 `Sprite2D` instances, each tinted per-frame to outline the currently-targeted cell(s). Single hollow-square 16×16 `DataTexture` (1-pixel white border, transparent interior) shared via `useOutlineMaterial`; per-cell color comes from the sprite's `tint` (no per-cell texture work).

**Color mapping (matches §3 of the spec):**
- `collect` → `#fcd34d` gold — single gem cell (NOT the halo extent)
- `pet` → `#f472b6` pink — driller's cell
- `drag` → `#60a5fa` sky — every cluster cell with FLAG_SHAKING|FALLING, OR the SaggingChunk's cells if hovering soil-in-motion
- `brace` → `#fb923c` orange — every cell of the sagging chunk under cursor
- `paint` → `#ef4444` red — single hover cell

**Why pool, not entity-per-outline:**
- Per-frame action resolution is already done in `Pointer.hoverAction`. The outline is a pure visual derivative — no entity lifecycle to manage.
- A fixed 64-slot pool covers the worst-case multi-cell chunk; unused slots are hidden via `scale.set(0,0,1)` (the canonical Sprite2D hide pattern in the rest of the codebase).
- One material, tinted per sprite — same pattern as `useDrillerMaterial` for the rest of the rendering surface.

**Cluster targeting logic:**
- For `drag` while a drag is already active, reads `Drag.clusterId` so the outline follows the dragged cluster (it's literally moving each tick — the outline tracks the new cell positions automatically because `Grid.clusterId` updates atomically with the translation).
- For `drag` over a chunk we're ABOUT to grab (not yet dragging), reads `clusterId[hoverCell]` so the outline previews the whole cluster before the player commits.
- `SaggingChunk` falling-soil case detected via `world.query(SaggingChunk)` + cells-contains-hover check.

**Render order = 100** so outlines draw on top of tiles within the Flatland scene.

**Verification:** typecheck clean; 179/179 tests pass (no behavior change for existing tests — the renderer is read-only).

## In-canvas feedback HUD — Phase 3 (spendGems + -N popup)
**File:** `minis/driller/src/{traits/input-traits.ts,constants.ts,systems/{gem-spend.ts,input.ts,drag.ts},materials.ts,components/{GemSpendPopupRenderer.tsx,Scene.tsx}}`, `tests/gem-spend.test.ts`
**Date:** 2026-05-12

**Decision:** Every gem-spend site now routes through `spendGems(world, amount, col, row)` which both deducts AND spawns/stacks a floating "-N + gem" popup. The new `GemSpendPopup` trait holds `{col, row, amount, startTick}`; the renderer animates it across `GEM_SPEND_POPUP_TTL_TICKS=36` (~0.6 s @ 60 Hz). `gemSpendPopupSystem` destroys popups past TTL each tick.

**Stacking rule (the load-bearing part):** a held paint drag would otherwise spawn 60 popups per second. `spendGems` looks for an existing popup at `(col, row)` within `GEM_SPEND_POPUP_STACK_WINDOW=4` ticks; if found, it increments `amount` and resets `startTick` (visual restarts on the larger value). Without the stack window the screen becomes confetti during sustained paint.

**Refactored call sites:**
- `doPet` — spends `PET_COST` at `(driller.col, driller.row)`
- `doBrace` — spends `BRACE_COST` at `(pointer.hoverTargetCol, hoverTargetRow)`
- `doPaint` — spends `PAINT_COST_PER_TICK` at the painted cell
- `dragSystem` — spends per-interval cost at `(drag.anchorCol, anchorRow)`

Each site previously called `world.set(GameState, { gems: gs.gems - X })` directly; that pattern is now banned (no other code touches `GameState.gems` for the spend path).

**Renderer design:**
- Two pools of `Sprite2D`: 64 digit slots + 64 icon slots. Realistically a popup uses 2-4 sprites (minus + digits + gem icon), so 64 of each comfortably covers 16 simultaneous popups.
- Per-popup composition: "-" + digit(s) for the amount, gap, then gem icon. Layout centered on the popup's cell with the whole row treated as a single unit.
- Animation curve: ease-in pop (0→0.22 of TTL: scale 0.6→1.2), settle (0.22→0.55: scale → 1.0, y rises), fade (0.55→1: scale 1.0→0.9, alpha 1→0).
- Materials: `useIconsMaterial` + `useDigitsMaterial` factories in `materials.ts` load the baked PNGs with `NearestFilter` for pixel-art crispness; Sprite2D `setFrame()` picks the cell from the regions table.

**Verification:** `tests/gem-spend.test.ts` covers (a) deduct + spawn, (b) refuse when broke, (c) stack within window, (d) no stacking across cells, (e) no stacking past window, (f) TTL destroys, (g) alive before TTL. 186/186 unit tests pass; typecheck clean.

## In-canvas feedback HUD — Phase 4 (action info-popup)
**File:** `minis/driller/src/components/{InfoPopupRenderer.tsx,Scene.tsx}`
**Date:** 2026-05-12

**Decision:** A single info-popup (icon + bar) renders next to the active interaction. Priority order (highest visible source wins): active drag → pet pause → held paint → hovered armed gem. One cell above the anchor cell, three sprites (icon + bar track + bar fill).

**Bar metric per source:**
- **drag** → `(elapsed % DRAG_COST_INTERVAL_TICKS) / interval`. Fills red as the next cost-tick approaches. Tells the player "you're about to be billed."
- **pet** → `(pausedUntilTick - tick) / PET_PAUSE_TICKS`. Pink, drains as the pause ends.
- **paint** → `min(1, gems / 20)`. Green when ≥5 gems remain, red salmon when running low — the player sees their runway evaporate as they paint.
- **gem-fade** → `(expireAtTick - tick) / GEM_FADE_TICKS`. Yellow→pink as the timer drains; triggered when the cursor hovers an armed gem (including its halo).

**Pet mood icon source:**
- `fear > 0.6` → `pet.angry`
- `trust > 5` → `pet.happy`
- else → `pet.neutral`

**Why a single popup, not per-source:**
- The popups would otherwise overlap visually if e.g. dragging while hovering an armed gem.
- The priority cascade matches the resolveHoverAction semantics (drag is the active state, others are passive informational).
- Three sprite refs total — no pool needed because there's at most one popup at a time.

**Bar implementation:**
- The fill sprite is anchored at the bar-left edge: `position.x = barLeft + fillW/2` with `scale.x = fillW`. Sprite2D scales around its center, so this keeps the left edge fixed as the fill width changes.
- Bar bg uses 50% alpha for legibility over busy tile backgrounds without being opaque.

**Why reuse `useDrillerMaterial` for the bar:**
- That material wraps a 1×1 white pixel texture, which is exactly what a flat tinted bar needs. No new material; no new texture upload.

**Verification:** Typecheck clean. 186/186 unit tests pass. No new tests — this is pure renderer code (no commitable state mutation) and the underlying state (Drag, Driller, Pointer, Gem) is already tested in earlier suites.

## In-canvas feedback HUD — Phase 5 (pet mood icon + over-pet shake)
**File:** `minis/driller/src/{traits/input-traits.ts,constants.ts,systems/{input.ts,gem-spend.ts},components/{InfoPopupRenderer.tsx,OverPetRenderer.tsx,Scene.tsx},generated/icons.{png,ts}}`, `tests/pet.test.ts`
**Date:** 2026-05-12

**Decision:** Pet feedback escalates over the pet count within the window so the player gets positive reinforcement on the way in AND an explicit warning before crossing the over-pet line.

**Per-pet-count icon (rendered by InfoPopupRenderer while paused):**
- 1 pet → `pet.love` (❤️, pink bar) — positive first-touch reinforcement
- 2 pets → `pet.happy` (😊, pink bar)
- 3 pets → `pet.warning` (⚠️, amber bar) — "one more pet would be too many"
- 4+ pets → over-pet path: pause cleared, `OverPetIndicator` spawned

**Over-pet visual:** A new entity-based trait `OverPetIndicator({col, row, startTick})` spawns in `doPet`'s over-pet branch. `OverPetRenderer` draws an `pet.angry` (😠) icon over the driller's cell with horizontal sine shake (5 cycles, 2px peak, dampening across `OVER_PET_SHAKE_TICKS=20` ticks ~ 0.33s). The shared `gemSpendPopupSystem` reaps these past TTL (extended to handle both popup types).

**Why a separate renderer (not folded into InfoPopupRenderer):**
- The over-pet visual fires AFTER the pause is cleared, when InfoPopupRenderer has no pet to show.
- The shake animation is unique to over-pet and doesn't fit the icon+bar layout.
- Multiple entities possible if the player rapid-fires over-pets (rare but supported with a 4-slot pool).

**Icon sheet update:** Re-baked `icons.png` with two new entries:
- `pet.love=❤️`
- `pet.warning=⚠️`

Total icons in sheet: 10. Sheet dimensions unchanged at 128×16 (it already had room).

**Verification:** `tests/pet.test.ts` extended with an OverPetIndicator-spawn case. 187/187 unit tests pass; typecheck clean.

## In-canvas feedback HUD — Phase 5b (asset loader + mood-bubble redesign)
**File:** `scripts/bake-icons.ts`, `minis/driller/src/{generated/*,materials.ts,components/{HoverOutlineRenderer.tsx,InfoPopupRenderer.tsx,MoodBubbleRenderer.tsx,Scene.tsx}}`
**Date:** 2026-05-12

**Decisions:**

1. **Asset loader: standard `import url from './x.png'`** (no `?inline` suffix). Vite emits the PNG to dist/ and returns a URL string; tsup library build inherits the same handling. StackBlitz / similar sandboxes can substitute the URL to point back to the repo's raw asset URL. This replaces the `new URL(..., import.meta.url)` pattern which doesn't survive the library build. `bake-icons.ts` now generates the import statement directly.

2. **No outline on the driller cell.** The pet interaction has its own visible feedback (mood bubble) so a colored selection box on top of the driller was redundant + ugly. The `pet` case is removed from `HoverOutlineRenderer`. Other actions keep their unique tints (collect=gold, drag=sky, brace=orange, paint=red).

3. **Mood bubble redesign — new `MoodBubbleRenderer`.** Pet feedback moved OUT of the bar-based InfoPopupRenderer into a dedicated chibi-bubble visual:
   - Two sprites: soft tinted "bubble" background (white-pixel material at 16×16 with 65% alpha, color shifts with mood: pink for love, cream for happy, amber for warning) + mood icon (12×12, scaled-up from 8×8 source).
   - No status bar — the bubble pops in (scale 0.4→1.2 across the first 15% of the pause window), settles (1.0 through 80%), then fades out (alpha + scale → 0 across the last 20%).
   - Icon picked from pet-count-in-window: 1=love, 2=happy, ≥3=warning. Over-pet is handled by the existing OverPetRenderer (pause cleared, angry shake).

4. **Gem hover outline pulses + uses Chebyshev-1 halo match.** Small gems in 8×8 visual size made the static 16×16 outline easy to miss. The pulse scales the outline ±25% at ~1.6Hz so it's unmistakable. Also fixed: clicking adjacent to a gem (halo collect) now outlines the GEM's exact cell, not the hover cell, so the player sees which gem the click will catch.

5. **Bake-icons CLI updated** to emit standard asset imports (`import sheetUrl from './x.png'`). Re-baked both sheets so the generated TS files use the new form.

**Why the bar approach was wrong for pet:**
The user specifically called out "a little chibi pixelated bubble" — that's a graphic, not a meter. The bar version conflated two different feedback modes (status indicator for time-bound actions like drag/paint, vs interaction confirmation for one-shot tap actions like pet). Splitting them clarifies both: pet = bubble, held-actions = info-popup with bar, gem-spend = particle "-N" popup.

**Verification:** Typecheck clean. 187/187 unit tests pass (no behavioral state changes — pure renderer/asset reshape). Manual visual verification deferred to the user — the asset URL switch is the key fix and is best confirmed in-browser.

## In-canvas feedback HUD — Phase 5c (texture flipY + sizing + cluster perimeter)
**File:** `minis/driller/src/{materials.ts,components/{HoverOutlineRenderer.tsx,GemSpendPopupRenderer.tsx,MoodBubbleRenderer.tsx,InfoPopupRenderer.tsx,OverPetRenderer.tsx,Scene.tsx}}`
**Date:** 2026-05-12

**Decisions:**

1. **`texture.flipY = false` for sprite-sheet materials.** Three.js's default is `flipY = true` (rotate image rows to match WebGL's bottom-left UV origin). My `REGIONS` table uses top-left pixel coordinates, so `flipY = true` was sampling the wrong row of the sheet → icons rendered as blank or wrong glyphs. This is the actual root cause of "I don't see any pixelated emojis." `useSheetMaterial` now disables flipY explicitly with a comment naming the trap.

2. **All HUD elements scaled up.** Tile is 16px; the original 6–8px sprite sizes were below the legibility floor. New sizes:
   - Gem-spend popup: digits 6→12, icons 8→16, gap 1→2
   - Mood bubble: icon 12→20, bubble bg 16→28
   - Info popup: icon 8→14, bar 16×3→24×4, gap 1→2
   - Over-pet shake icon: 8→20

3. **Cluster outline is now a perimeter, not per-cell boxes.** The previous render filled in a hollow square on every cluster cell — produced a "grid of rects" look the user explicitly called out. New approach: for each cluster cell, check 4 cardinal neighbors; for each neighbor that's NOT in the cluster set, draw a 2-pixel solid-fill line on that cell's edge. Result: a single continuous outline that traces the cluster's actual shape.

4. **Two material pools in `HoverOutlineRenderer`.** Cluster perimeter edges need a solid-fill sprite (lines), but single-cell outlines (collect, paint) still want the hollow-square texture. Renderer now accepts `outlineMaterial` (hollow square) + `fillMaterial` (solid white = `useDrillerMaterial`). 32 hollow-square slots + 256 edge slots — covers worst-case ~60-cell soil chunks with 4 edges each.

5. **Outline edge thickness = 2px.** 1px would alias at fractional scales; 2px reads cleanly as a deliberate line.

**Verification:** Typecheck clean. 187/187 unit tests pass.

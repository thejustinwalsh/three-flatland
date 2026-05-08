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

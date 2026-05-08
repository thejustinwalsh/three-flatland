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

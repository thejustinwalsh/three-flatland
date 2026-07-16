# Issue #53: Driller mini-game implementation

**Link:** https://github.com/thejustinwalsh/three-flatland/issues/53
**Branch:** `mini-game-showcase`
**PR:** #59 (draft)

## Goal
Build the driller mini-game (Mr. Driller × tamagotchi) — autonomous chibi character digs through procedurally-generated terrain, with mood-driven AI and one-touch user interactions. Ships with both a hero attract loop (embedded on docs landing) and a full mode (`/play` route, title + 3 lives + leaderboard).

## Approach
- Implementation follows the canonical task-by-task plan: `planning/superpowers/plans/2026-05-07-driller-mini-plan.md` (50 tasks across 13 phases + 5 deferred lighting sub-issues).
- Spec: `planning/superpowers/specs/2026-05-07-driller-mini-design.md` (17 sections).
- Visual asset: `minis/driller/art/source/driller-concept-sheet.png` (1536×1024 PNG with all sprites); see `minis/driller/README.md` for the extraction pipeline.
- All phases land on `mini-game-showcase` branch and the existing draft PR #59. No new PRs per phase.
- Atomic commits per logical change; no squashing.
- TDD where it adds confidence (RNG, scale picker, autotile, chunk-detect, mood drift); manual + dev-server verification for visual/integration work.
- Lighting (Phase 14) is deferred via sub-issues #54–#58 — gated on `feat-lighting-postprocess-flatland` merge.

## Phases (high-level — see canonical plan for task-level breakdown)

1. **Package scaffolding** — directory, package.json, tsconfig, vite, dev shell that boots
2. **World & traits** — static Koota world (HMR-safe), trait definitions
3. **Algorithm primitives (TDD)** — RNG, integer-scale picker, autotile bitmask resolver
4. **Rendering foundation** — PlayCanvas with scale picker, parallax background, deadzone camera
5. **Tiles, materials, atlas** — slice the source PNG into named regions; single shared `Sprite2DMaterial`; autotile pass + visible tile rendering
6. **Generation** — biome bands, CA cave carving, streaming chunk generator, fixture/gem placement
7. **Collapse physics** — chunk detection, sag telegraph, falling rigid body, land/reattach
8. **Driller + AI** — motion + dig, mood drift + biases, three planners, hysteresis selector
9. **Input + interactions** — pointer hover zones, Collect/Brace/Trigger/Pet, HoverCursor
10. **Death + respawn** — crush, scatter gems, ghost chute clears columns, respawn from top
11. **UI** — DepthBar, GemCounter, HeroHint
12. **Mode shells** — Game.tsx mode composition, TitleAttract, Leaderboard, world-fall transition
13. **Audio + polish** — ZzFX SFX, particles, driller animations, README, manual QA

Lighting integration (Phase 14) is filed as sub-issues #54–#58, blocked on lighting feature merge.

## Files likely to change
- `minis/driller/**` — entire new package (see canonical plan §"File structure" for full layout)
- `pnpm-workspace.yaml` — only if `minis/*` glob isn't already wide enough (it likely is)
- No edits to existing packages

## Out of scope
- Lighting integration (deferred to sub-issues #54–#58)
- Multiplayer / shared state
- Server-side leaderboard
- Touch-multitouch gestures
- Tutorial overlays
- Music tracks (SFX only)
- Configurable controls

## Verification strategy
- **Algorithmic primitives:** Vitest unit tests (TDD, see canonical plan Tasks 7, 8, 9, 16, 18, 20, 25)
- **Rendering / camera / autotile:** dev server + visual verification via `agent-browser` skill where available; otherwise manual
- **Integration / behavior:** dev server runtime, observe AI behavior shifts, verify all four one-touch actions
- **Responsive sizing:** test at 1920×1080, 1280×720, 768×1024, 414×896 (tests already specify expectations)
- **Hero loop endurance:** run 3+ minutes, verify no memory growth, world-fall transition fires cleanly
- **Full mode flow:** click through 3 deaths → leaderboard prompt; restart loop

## Open questions
None blocking. Canonical spec §16 lists 5 open questions, all with defaults documented.

## Decisions log
Per-decision context lives in `planning/issues/53/decisions.md` (committed, distilled to PR review comments at the end).

---

## Active sprint — Sag/Rock codex (post-MVP correctness pass)

Mini-game shipped end-to-end. Subsequent work is correctness + game-feel polish on the collapse/avalanche pipeline. Tracking here because each item lives in this branch, this PR.

### Sag codex (soil-side, locked)

Three rules:
1. **Anything that visually shakes must fall by ≥1 cell.** Any cell that shook AND ended up back as solid at the same grid location is a violator.
2. **Anything that falls must shake first.** A chunk going through the FallingChunk pipeline must have telegraphed via SHAKE.
3. **A cell shakes at most once per incarnation.** PRECARIOUS / SAGGING phases can re-enter freely; SHAKE is the commit signal.

3-phase state machine: PRECARIOUS (36t / ~600ms) → SAGGING (36t / ~600ms) → SHAKING (24t / ~400ms) → fall. Total telegraph 1.6s, every phase above the ~300ms human change-detection threshold so the player reads three distinct beats.

Fixed-step simulation at 60Hz (`Scene.tsx` accumulator) so timings are wall-clock-deterministic regardless of monitor refresh rate.

### Rock codex (locked)

Rocks are NOT soil — distinct rules:
1. 4+ connected stones to INITIATE a fall.
2. Fall damages stones (each soil-crush below = +1 hit; ≥4 hits = rock breaks off as a `Hazard` debris).
3. Cluster falls as a rigid unit, fixed shape per fall step.
4. Once falling, the cluster MUST resolve fully — even if rocks break off mid-flight and the survivors drop below 4, the surviving unit keeps falling until it lands.
5. No stop-shake-continue. Rocks resolve fully once started.
6. Inert clusters of any size (including <4) float as supports for soil.
7. Once landed, the cluster goes inert; needs fresh disturbance + 4+ to move again.

### Partial-drill semantics (locked: option C — re-evaluate)

When the driller drills a cell that's part of an in-progress sag, the surviving cells RE-EVALUATE in place:
- Filter to cells whose grid tile still matches their reserved tile.
- If survivors still satisfy `sagAllBottomEdgesAir`: shrink the entity to surviving cells, preserve current phase (PRECARIOUS / SAGGING / SHAKING). Drilling pulls a non-support → fall continues.
- If survivors no longer satisfy: cancel. Drilling pulls a support → cells revert to inert SOIL, the rest of the chunk re-evaluates next tick.

### Fixture rule (locked)

Fixtures (`TILE_FIXTURE_BASE+0..4`) are mother nature's safe haven — INDESTRUCTIBLE by anything: drill, fall-crush, avalanche-crush, explosive blast. Block soil falls. Block rock falls. Strategic terrain.

### Plan 1 — small correctness wins (~190 LOC, 6 commits)

A. **Lock in fixture indestructibility + tighten explosive guard.** Document the rule, add `isFixtureTile` helper, ensure explosive system uses it. ~30 LOC.

B. **Glom-fix bug.** When in-motion cluster lands on stone, check if merged is 4+ and can fall. If yes → propagate `FLAG_FALLING` to merged cells, skip telegraph (codex rule 5). If no → adjacent independent cluster lands inert. ~30 LOC.

C. **Mouse brace extends to shaking rock clusters.** `doBrace` (input.ts) already braces SaggingChunk; add: touching a rock cell in SHAKE phase extends the cluster's commit time by N ticks. Cannot brace in-motion. ~50 LOC.

D. **AI evades in-motion stone clusters.** Mirror `planEvadeFallingChunk`: any FallingChunk-projection-or-in-motion-rock-cluster's columns are hostile; planner reroutes. ~50 LOC.

E. **Drill / sag-release disturbs adjacent stones.** Today `markCellAndNeighborsDirty` only flags adjacent SOIL with `FLAG_SAG_RECHECK` — doesn't touch stone neighbors. Worldgen-placed clusters never fall unless a hazard rock lands nearby. Extend the dirty-marker to ALSO set `FLAG_DISTURBED` on adjacent `TILE_STONE` cells. ~20 LOC.

F. **Fixture placeholder color — unified amber tint.** Single guaranteed-distinct hue (`~[0.88, 0.74, 0.40]` honeycomb territory) across all fixture variants. Distinct from biome palettes (browns/greens/purples), from rocks (gray-tan), from explosives (red). Per-biome theming lands with the proper art pass. ~10 LOC.

### Phase 2 — rock unification + 4×4 max cap (~330 LOC)

G. **Unify `TILE_ROCK` + `TILE_STONE`** into one tile. Multi-hit health on ALL stones (drill = +1 hit, fall-crush = +1 hit). Driller can drill a 1hp rock to save themselves at the last second.

H. **`RockCluster` entities + 4×4 max cluster cap.** Persistent cluster identity via entities (mirroring SaggingChunk pattern, NOT per-cell IDs). Bottom-up bounding-box capture at cluster-creation. Once a cluster reaches 4 wide OR 4 tall, it locks; new rocks touching a locked cluster are independent. Renderer uses the packed stone variants in `src/assets/driller/world-tiles.png`; cross-cluster boundaries remain visually distinct.

I. **World-gen rules** (fairness-driven).
- No two telegraphing clusters within 4 columns of each other.
- No 4-tall vertical shafts under maxed clusters.
- Cadence: 1 maxed cluster per ~30–40 vertical tiles, 2–4 per biome.
- Place fixtures as strategic refuge points along the descent.

### Verification gates (sprint)

Every Plan 1 / Phase 2 item is ready when ALL of:

- **Unit tests pass** (`pnpm test`). New invariants pinned with new vitest cases.
- **Integration tests pass** (`pnpm test:integration`). The vitexec probe suite is the live-system evidence that the codex holds in real play. Adding a new mechanic SHOULD add a new integration probe (or extend an existing one) when the invariant isn't unit-testable.
- **Failure messages name files + likely causes.** A future agent looking at a red test must be able to act on it without reading the rest of this thread.

The integration suite is excluded from `pnpm test`; runs via `pnpm test:integration` (slow, browser-dependent). See `tests/integration/README.md` in the mini-game package for the convention.

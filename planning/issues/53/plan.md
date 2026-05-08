# Issue #53: Driller mini-game implementation

**Link:** https://github.com/thejustinwalsh/three-flatland/issues/53
**Branch:** `mini-game-showcase`
**PR:** #59 (draft)

## Goal
Build the driller mini-game (Mr. Driller × tamagotchi) — autonomous chibi character digs through procedurally-generated terrain, with mood-driven AI and one-touch user interactions. Ships with both a hero attract loop (embedded on docs landing) and a full mode (`/play` route, title + 3 lives + leaderboard).

## Approach
- Implementation follows the canonical task-by-task plan: `planning/superpowers/plans/2026-05-07-driller-mini-plan.md` (50 tasks across 13 phases + 5 deferred lighting sub-issues).
- Spec: `planning/superpowers/specs/2026-05-07-driller-mini-design.md` (17 sections).
- Visual asset: `planning/superpowers/specs/2026-05-07-driller-mini-tileset.png` (1536×1024 PNG with all sprites).
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

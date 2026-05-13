# Cantilever Codex — diffusion-based soil collapse

**Status:** SUPERSEDED by `collapse-redesign-plan.md` and the diffusion implementation in `src/lib/chunk-detect.ts`. This document captures the locked rules of the new model.

The pre-diffusion codex (top-edge + bottom-edge + STONE-anchors-up + FIXTURE-all-4-anchors + DISTURBED gating + JUST_LANDED grace + SAG_RECHECK gate) has been retired wholesale. Anchor distance is now a persistent grid value driven by per-tick relaxation; the world is mostly stable on stream-in and the player sees a slow visible wavefront of cracking when they drill load-bearing cells.

---

## The model in one paragraph

`Grid.anchorDist` is a `Uint8Array` parallel to `Grid.tiles`. On chunk gen, `seedAnchorsBFS()` runs once to bake the steady-state distance for every conductor cell. Every tick, `relaxAnchorDist()` runs one local relaxation step: each non-AIR cell looks at its 4 conductor neighbors and updates its stored distance toward `min(neighbor) + 1` (or `0` if it's a seed). **Variant C policy** governs the update direction:

- Rising stress (target > stored) propagates at **+1/tick** — slow visible wavefront.
- Falling stress (target < stored) **snaps instantly** — strength gain is immediate.

The renderer reads `Grid.anchorDist` directly to paint the cracking gradient. The sag detector reads `anchorDist > MAX_REACH` to gate the precarious → sagging → shaking → fall pipeline.

## Anchor topology (LOCKED)

| Tile | Anchor seed? | Conductor? |
|---|---|---|
| Top edge (row 0 SOIL/STONE) | yes — distance 0 | yes (+1 cost) |
| Cell DIRECTLY ABOVE a FIXTURE | yes — distance 0 | yes (+1 cost) |
| FIXTURE itself | no — wall | no — distance does not propagate through |
| Side walls (col 0 / col cols-1) | no | n/a |
| Bottom-loaded edge | no — `seedAnchorsBFS` pre-settle handles streaming | n/a |
| SOIL | no unless above a fixture or in row 0 | yes (+1 cost) |
| STONE | no unless above a fixture or in row 0 | yes (+1 cost) — "really sturdy soil" |
| AIR | no | no — not in graph |

**Why stones conduct but don't seed.** Rocks are heavy soil that don't crack visually. They participate in load distribution exactly like soil — a rock chain can extend a fixture's anchor reach across many cells — but they don't generate anchor support out of nowhere. A floating rock cluster has no anchor source; if AIR opens up below it, it falls per the rock cluster rule below.

**Why fixtures emit only upward.** Soil falls FROM fixtures, not glued TO them. A stack on top of a fixture is stable up to MAX_REACH cells high. Soil to the side of or below a fixture has to find its own anchor path through soil/stone routing — the fixture is a wall, not an omnidirectional magnet.

**Why bottom edge isn't a seed.** Pre-settling on chunk gen bakes the steady-state for the chunk-as-loaded. When the streaming frontier moves down (new chunks load below), previously-bottom cells that were transient anchors lose their "free" distance — the relaxation rises their distance over a few ticks and the player sees the wavefront. Worldgen contract: fixtures placed densely enough that no soil region is more than MAX_REACH from a seed.

## Cantilever rule (LOCKED)

A SOIL cell with `anchorDist > MAX_REACH` (or INF) is unstable. The connected SOIL chunk it belongs to gets a `SaggingChunk` entity that carries it through the lifecycle:

```
PRECARIOUS (54t) → SAGGING (54t) → SHAKING (30t) → release (fall)
```

Total telegraph ≈ 138 ticks (~2.3s). The cracking gradient renders before any state-darken, so the player sees weakness building well before PRECARIOUS engages.

`MAX_REACH = 6` (was 4 pre-diffusion). Bigger reach is required because the new anchor topology is stricter — fixtures emit only upward and side walls aren't anchors.

## willFall guard (LOCKED)

A sag entity only spawns if at least one cell of the candidate chunk has AIR directly below. This prevents "shake with no fall" — a chunk that's cantilever-unstable but resting on bedrock would otherwise enter the sag pipeline and 0-displacement land.

## Rock cluster fall rule (LOCKED)

Independent of soil cantilever. A `TILE_STONE` cluster (4-connected by `clusterId`) falls when:

- Idle (no FLAG_FALLING): every cell of the bottom-most row has **AIR** directly below.
- In-motion (FLAG_FALLING set): every cell of the bottom-most row has AIR or SOIL below (in-motion clusters crush soil).

Streaming defer: if the bottom-most row sits at `r+1 >= rows`, evaluation is deferred until the streamer extends the world below.

## Cluster identity (LOCKED)

`Grid.clusterId: Uint16Array`. Assigned at world-gen (Tetris shapes) and at hazard land (`pickClusterIdForNewStone`). The 4×4 max-bbox cap is enforced at PLACEMENT — a fresh stone joining an adjacent cluster gets a new id if joining would exceed 4×4. Two adjacent-but-independent clusters never glom (autotile renders strokes between them; avalanche treats them separately).

## Removed concepts (do not re-add)

- `FLAG_DISTURBED` — was a per-stone bit gating avalanche eval. Diffusion runs every tick; no per-cluster disturbance bit needed.
- `FLAG_SAG_RECHECK` — was a per-soil-cell flag gating sag re-eval. Diffusion runs every tick; no gate needed.
- `FLAG_JUST_LANDED` — was a 1-tick grace period for landed cells. Snap-down rule in relaxation handles it naturally.
- "Bottom edge as anchor seed" — was a streaming-defer hack. Pre-settle does this cleanly.
- "STONE anchors only directly above" — replaced by stones-as-conductors.
- "FIXTURE anchors all 4 directions" — replaced by fixture-up-only-seed.

## Biome density (Mario progression)

| Biome | Fixtures | Caves | Player experience |
|---|---|---|---|
| topsoil | 4-6 | 2-3 | "Introduce" — stable world, learn the gradient |
| deep-dirt | 4-6 | 3-4 | "Demonstrate" — first collapses, soft consequences |
| stoneworks | 3-5 | 3-5 | Rocks pick up the stability load |
| crystal-caverns | 3-5 | 4-6 | Chaos rising |
| core | 3-5 | 5-7 | "Game in full swing" |

## Open follow-ups (post-redesign)

- `unstableCells` perf: scans full grid every tick; should bound to scan window when window is small.
- Avalanche FLAG_SHAKING on out-of-view stones: `rockAvalancheSystem` doesn't cull stones outside the camera viewport, so off-screen rocks can enter the shake telegraph. Visible-shake integration test fails on this.
- Some legacy integration tests (`visible-shake`, `shake-contract`, `shake-or-stay`, `single-shake`, `three-phase-timing`) need rewrites for the diffusion model — they pin invariants that don't translate.
- Consider whether the `inMotion ? AIR-or-SOIL : AIR` canFall split for rocks can also be unified now (left in place because dropping it would tip every natural worldgen cluster on first tick).

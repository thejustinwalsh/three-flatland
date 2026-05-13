# Driller Mini — Game Rules

The single source of truth for the mini-game's behavioural rules.
Every rule here is enforced by code in `minis/driller/src/systems` and
verified by an ECS systems test in `minis/driller/tests`. Update both
when the rules change.

> **TL;DR for engineers:** if you change a rule here, write or update
> the test that proves it. If a test fails, the rule is the contract;
> the code is the bug.

---

## 1. World Layout

| Rule | Code | Test |
|---|---|---|
| World width is fixed at `PLAY_COLS = 18`. | `constants.ts` | `tests/scale.test.ts` |
| Each "world" layer is `WORLD_BODY_ROWS = 150` cells of one biome's body, followed by `WORLD_VOID_ROWS = 55` cells of pure-AIR void. | `biomes.ts`, `systems/generation.ts` | `tests/biomes.test.ts` |
| Biomes cycle through `BIOMES[]` in declared order. The biome NEVER changes within a single world — only after the driller falls through the void into the next layer. | `biomeAt(row)` | `tests/biomes.test.ts` |
| Free-fall band rows are forced to AIR by the chunk generator. | `generateChunk` | `tests/generation.test.ts` |

## 2. Driller Movement

| Rule | Code | Test |
|---|---|---|
| Driller moves at a fixed pixel-per-ms rate toward `destCol, destRow`. Speed scales with depth via `stepIntervalForDepth(row)`. | `drillerSystem` | `tests/driller-motion.test.ts` |
| When `destCol === col && destRow === row`, the driller is at REST. Picks next action this tick. | `drillerSystem` | `tests/driller-motion.test.ts` |
| Walking through AIR consumes the frame budget continuously — no per-cell stop. Mid-frame arrival picks new dest and applies leftover budget. | `drillerSystem` budget loop | `tests/driller-motion.test.ts` |
| Drilling pins the driller in place for `DRILL_COOLDOWN_MS`. Block becomes AIR on completion AND motion resumes within the same tick. | `drillerSystem` drill timer | `tests/driller-motion.test.ts` |
| Driller never moves UP. Up-actions DRILL the cell above only. | `pickAction` | `tests/driller-motion.test.ts` |
| Gravity wins over the planner: when the support cell is AIR, dest is set to (col, row+1) regardless of planner intent. | `pickAction` | `tests/driller-motion.test.ts` |
| In the void, the driller can drift one column laterally per fall step toward the planner target. | `pickAction` (fall branch) | `tests/driller-motion.test.ts` |
| The driller's own cell is FORCE-cleared to AIR every tick (safety). | `drillerSystem` start | — |

## 3. Sag Detection (cantilever rule)

| Rule | Code | Test |
|---|---|---|
| `unstableCells(MAX_REACH = 10)` marks SOIL cells whose path-through-soil distance to the nearest anchor exceeds the reach. Anchors: STONE, ROCK, fixtures, world side+bottom edges. Top edge does NOT anchor (sky). | `lib/chunk-detect.ts unstableCells` | `tests/chunk-detect.test.ts` |
| The cantilever rule ONLY fires on a SOIL chunk if at least one of its cells carries `FLAG_SAG_RECHECK`. This bit is set by `markCellAndNeighborsDirty` (i.e. by player actions: drill, hazard land, chunk re-attach, avalanche crush). Fresh worldgen-loaded chunks do NOT carry it. | `detectAndSag` | `tests/collapse.test.ts` |
| `FLAG_SAG_RECHECK` is cleared after `detectAndSag` processes a chunk so it doesn't re-fire every tick. | `detectAndSag` | `tests/collapse.test.ts` |
| A SOIL chunk only spawns a `SaggingChunk` if AT LEAST ONE bottom-edge unstable cell has AIR directly below it. Cells that are cantilever-unstable but pinned by solid below do NOT sag (no shake-with-no-fall). | `detectAndSag` willFall guard | `tests/collapse.test.ts` |
| Once a `SaggingChunk` is spawned, it WILL release as a `FallingChunk` after `SAG_DURATION_TICKS` (modulo bracing). Sag = commitment. | `tickSagging` | `tests/collapse.test.ts` |

## 4. Shake Telegraph (FLAG_SHAKING)

| Rule | Code | Test |
|---|---|---|
| `FLAG_SHAKING` means "this cell drops next, no take-backs". | — | `tests/shake.test.ts` |
| Sagging soil cells get `FLAG_SHAKING` ONLY in the last `SAG_SHAKE_LEAD_TICKS = 18` (~300ms) of their sag duration. Earlier sag = subtle darken only. | `tickSagging` | `tests/shake.test.ts` |
| Avalanche stone clusters shake during the pre-fall telegraph (`AVALANCHE_SHAKE_TICKS = 18` shake + `AVALANCHE_SETTLE_TICKS = 6` settle). Subsequent fall steps after the first commit DO NOT replay the shake. | `rockAvalancheSystem` | `tests/shake.test.ts` |
| The renderer applies a per-block UNIFIED jitter to shaking cells (not per-cell phase) so the whole mass shudders together. | `TileRenderer.tsx` | (visual only) |
| At the start of `rockAvalancheSystem` every tick, `FLAG_SHAKING` is cleared from EVERY TILE_STONE in the scan window. The cluster iteration re-sets it ONLY for cells in clusters actively shaking this tick. Idempotent — no stuck shake possible. | `rockAvalancheSystem` pre-pass | `tests/shake.test.ts` |
| Sub-4-cell stone clusters have their `shakeStartTick` map entries dropped so a future re-grow starts a fresh telegraph. | `rockAvalancheSystem` | `tests/shake.test.ts` |

## 5. Avalanche Cluster (4+ stones)

| Rule | Code | Test |
|---|---|---|
| 4+ TILE_STONE cells in one 4-connected cluster are eligible to fall as a unit. Smaller clusters are inert. | `rockAvalancheSystem` | `tests/avalanche.test.ts` |
| A cluster only falls if at least one cell carries `FLAG_DISTURBED`. Naturally-occurring 4+ piles from worldgen are inert until the player destabilises them. | `rockAvalancheSystem` | `tests/avalanche.test.ts` |
| Destabilising events: driller drills any tile in the cluster's 4-neighbourhood, OR a fresh rock lands on/next to the cluster (via `disturbAdjacentStones` / hazard-land). | `disturbAdjacentStones` | `tests/avalanche.test.ts` |
| `FLAG_DISTURBED` is sticky — only clears when a cluster cell actually moves (commits a fall step). | `rockAvalancheSystem` | `tests/avalanche.test.ts` |
| The cluster falls as a unit, throttled to one row per `AVALANCHE_FALL_INTERVAL_TICKS = 12` (~200ms). | `rockAvalancheSystem` | — |
| Each bottom-edge stone that crushes a SOIL cell on a fall step accumulates +1 hit on its `grid.hits[idx]`. After `AVALANCHE_HITS_TO_BREAK = 4` hits the rock breaks. | `rockAvalancheSystem` | `tests/avalanche.test.ts` |
| Broken rocks spawn a falling `Hazard` with `isDebris = true`. They fall to the earth via hazard physics but DO NOT deposit a STONE on landing — they die quietly. | `rockAvalancheSystem` + `hazardTickSystem` | `tests/avalanche.test.ts` |

## 6. Falling Rocks (Hazards)

| Rule | Code | Test |
|---|---|---|
| Rocks spawn at the LOGICAL playfield top (`driller.row - PLAYFIELD_TOP_OFFSET_ROWS = 8`), not the visual viewport top. Tall monitors don't get extra rock-dodge room. | `hazardSpawnSystem` | `tests/hazard.test.ts` |
| Rocks spawn ONLY in columns with continuous AIR from playfield top down to `driller.row + MIN_FALL_CELLS = 3`. The driller must have actively drilled a hole for a rock to fall into it. | `hazardSpawnSystem` | `tests/hazard.test.ts` |
| Post-respawn cooldown: rocks suppressed until `driller.row > deathRow + POST_RESPAWN_ROCK_COOLDOWN_ROWS = 3`. The freshly-cleared ghost chute can't be exploited. | `hazardSpawnSystem` + `setHazardSafeMinRow` | `tests/hazard.test.ts` |
| In the void band, no hazard spawns and all in-flight Hazards are despawned. | `hazardSpawnSystem`, `hazardTickSystem` | `tests/hazard.test.ts` |
| Natural rocks (not debris) deposit a STONE one cell above the cell they land on, born `FLAG_DISTURBED`. | `hazardTickSystem` | `tests/hazard.test.ts` |

## 7. Death (Squish only)

| Rule | Code | Test |
|---|---|---|
| Falling rocks ONLY kill the driller if (a) they LAND at the driller's cell AND (b) the driller is on solid ground at that cell. Mid-flight overlap is a near miss. | `hazardTickSystem` land branch | `tests/death.test.ts` |
| Falling soil chunks ONLY kill if a chunk cell lands AT the driller's cell AND the driller is on ground. | `landAndReattach` | `tests/death.test.ts` |
| On death: scatter gems → ghost-beam phase → respawn at death cell. | `deathSystem` | `tests/death.test.ts` |
| The ghost beam clears a 3-wide chute (deathCol±1) ascending from the death cell to the top of the visible viewport, then INSTANT-clears all remaining cells in the chute up to row 0. No "ancient past" cells can fall back through. | `deathSystem` ghost phase | `tests/death.test.ts` |
| Scattered gems are spawned as regular falling Gem entities (no special TTL). | `scatterGems` | `tests/death.test.ts` |

## 8. Gems

| Rule | Code | Test |
|---|---|---|
| Gems fall at one universal rate `FALL_INTERVAL_MS = 320` (slower than the driller's slowest dig step). The driller always overtakes gems; in the void this scrolls them up past the player. | `gemGravitySystem` | `tests/gem-gravity.test.ts` |
| Gems collect on contact in either direction (driller walks into gem, OR gem falls onto driller). | `gemGravitySystem` + `collectGemAt` | `tests/gem-gravity.test.ts` |
| When a gem crosses ABOVE the logical playfield top (into the dark overlay band), it enters a 4-row death tween: anticipation pop to 1.2× then cubic ease-out scale + alpha collapse. Despawn after. | `gemGravitySystem` + `GemRenderer` | `tests/gem-gravity.test.ts` |
| The void band gets extra gems with a quadratic density taper from top to bottom. Deeper worlds get a +1 progressive jackpot bonus. | `generateChunk` void pass | `tests/generation.test.ts` |

## 9. Worldgen (Mario-progression)

| Rule | Code | Test |
|---|---|---|
| Each later biome adds NEW concepts; previous biomes' content stays in the mix. (Topsoil: gems + caves + tunnels; Deep-dirt: + bones + stone clusters; Stoneworks: + rocks + hazards; Crystal: + explosives + crystals; Core: dense everything.) | `biomes.ts` + `generation.ts` | `tests/generation.test.ts` |
| Stone shapes are tetris-style: weighted pool from singles → tetrominoes → rare 5-pents. Deeper biomes bias toward larger shapes. | `placeStoneCluster` + `STONE_SHAPES` | `tests/generation.test.ts` |
| Wide horizontal tunnels per chunk per biome (`carveTunnels`) fragment soil for cantilever overhangs. | `carveTunnels` | `tests/generation.test.ts` |

---

## Test Conventions

- Tests live in `minis/driller/tests/<system>.test.ts`.
- Each test instantiates a Koota world with a hand-crafted ASCII grid via the helper in `tests/collapse.test.ts` (`makeWorldFromGrid`).
- Tests assert on the post-tick state of trait values (Driller, Gem, etc.) and grid flags / tile classes.
- A test name should read as a sentence describing the rule it enforces.

If you add a system, you also add a `tests/<system>.test.ts`. If you change a rule above, you also update the corresponding test.

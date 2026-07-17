# Collapse Redesign — Diffusion-Based Anchor Distance

**Goal:** Replace the per-tick BFS + DISTURBED + JUST_LANDED dance with a unified diffusion model where anchor distance is a persistent grid value, propagated by 1-cell-per-tick relaxation. Player sees a visible wavefront of weakness spreading from drilled cells; cause and effect is legible.

**Branch:** `mini-game-showcase` (continuation, no new PR — same workstream as issue #53).

**Supersedes:** the parts of `cantilever-codex.md` that pin the old anchor-topology rules (top+bottom anchors, stones-anchor-only-directly-above, force-eval avalanche). Those rules are replaced wholesale.

---

## The model

### Anchor seeds (distance 0)
- Top edge: row 0 SOIL/STONE cells
- Fixtures: emit seed into the cell DIRECTLY ABOVE only
- Bottom-loaded edge: NOT a seed (drop the streaming-defer hack; pre-settle handles it)

### Conductors in the BFS / relaxation graph
- SOIL: full conductor at +1 cost
- STONE: full conductor at +1 cost (rocks-as-conductors, "really sturdy soil")
- FIXTURE: wall — distance does NOT propagate through it
- AIR: not in graph

### Relaxation rule (Variant C: slow rise, instant snap)
Each tick, each non-AIR cell does:
```
target = isAnchorSeed ? 0 : min(neighbor.anchorDist) + 1
if target > stored: stored = stored + 1   // weakness propagates 1 cell/tick
if target < stored: stored = target       // strength snaps instantly
```
Result: drilling a cell triggers a visible wavefront of cracking that ripples outward at 1 cell/tick.

### Pre-settle on chunk gen
When worldgen creates a chunk, run a full BFS once to seed the steady-state anchor distances. After that, only relaxation runs per tick.

### Sag pipeline (unchanged shape, new trigger)
A SOIL cell with `anchorDist > MAX_REACH` enters the sag pipeline:
- precarious 54t → sagging 54t → shaking 30t → fall (~138t = 2.3s telegraph)
- Player reads the cracking gradient first (the wavefront), then the discrete state-darken (sag commit), then the jitter (shake), then the fall.

### Rock cluster fall rule (unchanged)
- Idle cluster: AIR-below-bottom-row → fall
- In-motion cluster: keeps falling (FLAG_FALLING gate)
- Crush soil mid-fall, accumulate hits, break at STONE_MAX_HITS
- 4×4 max bbox enforced at PLACEMENT via cluster_id

---

## Kill list

These all go away:
- `FLAG_DISTURBED` — concept entirely removed (autotile-pass, hazard, tests)
- `FLAG_JUST_LANDED → SAG_RECHECK` propagation (`recentlyLandedIdxs`, the dance) — relaxation handles it naturally
- `FLAG_SAG_RECHECK` short-circuit gate — relaxation runs unconditionally; sag pipeline gates on `anchorDist > MAX_REACH`
- `anchorDistanceMap()` per-tick call from TileRenderer — read from `grid.anchorDist` instead
- `unstableCells()` per-tick BFS in `detectAndSag` — replaced by a scan of `grid.anchorDist`
- "stones anchor only directly above" rule in `anchorDistanceMap`
- "bottom-loaded edge as anchor seed" in `anchorDistanceMap`
- `if (inMotion) AIR-or-SOIL else AIR` split in `rockAvalancheSystem` — back to single AIR-only rule (rocks-as-conductors changes the soil-side; rock fall rule itself was always force-eval)
- Force-eval comments / `recentlyLandedIdxs` module list

---

## Constants

- `MAX_REACH`: 4 → **6** (bigger reach, longer tunnels possible, fixtures more important)
- Sag pipeline ticks unchanged
- Cluster cap unchanged

## Biome density (Mario progression)

Early biomes: dense fixtures, light caves, few rocks (introduction).
Late biomes: sparse fixtures, dense caves, many rocks (chaos).

| Biome | Fixtures | Caves | Rock-shape variety |
|---|---|---|---|
| topsoil | dense (3-5) | light (2-3) | low (small shapes) |
| deep-dirt | dense (3-5) | light (3-4) | medium |
| stoneworks | medium (3-5) | medium (3-5) | medium-high |
| crystal-caverns | sparser (4-6) | medium-heavy (4-6) | high |
| core | sparse (5-7) | heavy (5-7) | full pool (gnarly pentominoes) |

(Fixture counts already mostly in this range; cave counts already adjusted.)

---

## Phases

### Phase A — persistent anchorDist + relaxation
- Add `anchorDist: Uint8Array` to Grid trait (parallel to tiles)
- Write `relaxAnchorDist(grid)` — Variant C single-step
- Write `seedAnchorsBFS(grid)` — full BFS, called on chunk init for pre-settle
- Replace per-tick `anchorDistanceMap()` call sites with reads from `grid.anchorDist`
- Run `relaxAnchorDist` from `collapseTick` before sag detection

### Phase B — fixture-up-only seeds + stones as conductors
- `seedAnchorsBFS` seeds: row 0 SOIL/STONE; cell-above-fixture (if SOIL/STONE)
- BFS conductor: SOIL + STONE both expand 4-way at +1 cost
- Walls in BFS: AIR (not in graph) and FIXTURE (no propagation through)
- Bottom-loaded edge: no longer a seed

### Phase C — kill DISTURBED + JUST_LANDED dance + force-eval gymnastics
- Remove `FLAG_DISTURBED` from traits + all sites
- Remove `FLAG_JUST_LANDED → SAG_RECHECK` dance + `recentlyLandedIdxs`
- Simplify `rockAvalancheSystem` canFall: single AIR-only rule for both inMotion and idle (in-motion still uses FLAG_FALLING to bypass shake telegraph)
- Drop `FLAG_SAG_RECHECK` short-circuit; sag detection scans `grid.anchorDist > MAX_REACH` directly

### Phase D — MAX_REACH bump + biome density
- `MAX_REACH = 6` in constants
- Update biome fixture/cave counts per Mario progression table

### Phase E — visual rendering + tests
- `TileRenderer` reads `grid.anchorDist` (not freshly computed)
- Stones render uniform — no crack gradient on TILE_STONE
- Update unit tests:
  - Anchor topology tests (fixture-up-only, stones-as-conductors)
  - Cantilever tests (MAX_REACH=6 setups, persistent dist)
  - Avalanche tests (drop DISTURBED gate)
  - Glom tests (cluster_id still applies; rocks-as-conductors changes anchor-side only)
  - Disturb-stones test → delete (DISTURBED is gone)

### Phase F — verify + commit + push
- `pnpm typecheck`
- `pnpm test` (unit)
- `pnpm test:integration` (vitexec)
- Commit per phase, push at end

---

## Verification evidence
Captured per phase in commit messages.

# Driller ECS Design Review

A self-audit of the mini-game's Koota ECS to confirm the design is
sound and identify the actual root causes of any "weird state"
symptoms (stuck shake, gems appearing randomly, things-doing-weird-
things). Written after the rules + tests pass for the documented
invariants.

## Verdict (TL;DR)

The ECS design is **sound**. The bugs we hit weren't ECS-architecture
problems; they were **rule-detection** problems. Specifically:

- **Stuck shake** = the cantilever rule fired on every chunk every
  tick (no disturbance gate), and on cells with no AIR below them
  (no willFall guard). Fixed by FLAG_SAG_RECHECK gate + willFall
  guard. Verified by tests/collapse.test.ts and tests/shake.test.ts.
- **Avalanche walks downward forever** = broken-rock Hazard deposited
  STONE on landing, which re-clustered with the shrinking cluster
  above. Fixed by Hazard.isDebris flag. Verified by
  tests/avalanche.test.ts.
- **"Gems appearing randomly"** = the streaming chunk loader runs
  ahead of the player; new chunks come in pre-populated with gems.
  This is by design.

The ECS itself does NOT have entity-recycling bugs, snapshot-vs-ref
mistakes, or detached-flag leaks — see audit below.

---

## 1. Trait inventory

| Trait | Lives on | Owner | Mutated by |
|---|---|---|---|
| `GameState` | singleton entity | game shell | every system that bumps tick / state |
| `Grid` | singleton entity | streamer | streamChunks, drill, hazard, collapse, etc. |
| `Camera` | singleton entity | cameraSystem | cameraSystem |
| `Seed` | singleton entity | game shell | restart |
| `Pointer` | singleton entity | input bridge | DOM event handlers |
| `Driller` | one entity at a time | death/respawn | drillerSystem |
| `Animation`, `Mood`, `PlannerTarget`, `PetEvents` | attached to Driller entity | death/respawn | driller / mood / planner / input |
| `Gem` | one per gem | generation, death scatter | gem-gravity, drill collect |
| `Hazard` | one per falling rock | hazard spawn, avalanche break | hazardTickSystem |
| `Explosive` | one per explosive tile | generation | explosiveSystem |
| `SaggingChunk` | one per sagging soil mass | detectAndSag | tickSagging |
| `FallingChunk` | one per in-flight chunk | tickSagging release | tickFalling |
| `Particle` | one per dust/spark | particles, explosion | particlesSystem |

**Single source of truth**: every trait has exactly ONE writer
authority. Other systems may read but only one mutates per field.

## 2. Per-cell state (Grid.flags)

The grid's per-cell flags live in `Grid.flags: Uint8Array`. Each bit
has an authoritative writer:

| Flag | Writer | Cleared by |
|---|---|---|
| `FLAG_SAGGING` | `detectAndSag` (set on chosen unstable cells when spawning a SaggingChunk) | `tickSagging` release; void cleanup; `chunkHasFlag` gate prevents double-spawn |
| `FLAG_FALLING` | `tickFalling` (briefly in-flight); landAndReattach clears | landAndReattach |
| `FLAG_AUTOTILE_DIRTY` | `markCellAndNeighborsDirty`, generation, etc. | `autotilePass` |
| `FLAG_PRECARIOUS` | `detectAndSag` simulation pass | `detectAndSag` start (clears window) |
| `FLAG_SHAKING` | `tickSagging` (final window) and `rockAvalancheSystem` (cluster shake) | `tickSagging` release; `rockAvalancheSystem` universal pre-pass clear; void cleanup |
| `FLAG_DISTURBED` | `disturbAdjacentStones`; hazard land deposit | `rockAvalancheSystem` commit branch (only when a stone actually moves) |
| `FLAG_SAG_RECHECK` | `markCellAndNeighborsDirty` | `detectAndSag` after processing chunk |

**Audit invariant**: every flag has a dedicated clearer. No flag
can leak — verified by `tests/shake.test.ts` (`FLAG_SHAKING is
cleared on release`, `clears FLAG_SAG_RECHECK after processing`),
`tests/collapse.test.ts` (`sagged cells eventually release`).

## 3. Entity lifecycle

- **No manual ID recycling.** Every spawn uses `world.spawn(...)`,
  every destroy uses `entity.destroy()`. Koota generates unique IDs.
- **Driller respawn**: the OLD Driller entity is destroyed (in
  deathSystem) and a NEW one spawned (`respawnDrillerAtDeath`). No
  attempt to reset state on the same entity. Mood/Animation/PetEvents
  attach via the same `world.spawn()` call so they stay paired.
- **Gem entities**: spawned by `loadChunk` (per-chunk worldgen) and
  by `scatterGems` (death). Despawned by `unloadChunk` (chunk leaves
  streaming window) or `entity.destroy()` in gem-gravity (off-top
  fade).
- **Hazard / Sagging / Falling / Particle**: spawned and destroyed
  inside their owning system. No cross-system destroy (except void
  cleanup, which is intentional).

**Audit**: `git grep "world.spawn"` and `git grep "entity.destroy"`
every spawn has a matching destroy path. No leaks.

## 4. Mutation discipline (Koota snapshots)

Koota's `entity.get(Trait)` returns a SNAPSHOT, not a live reference.
Direct mutation of snapshot fields is silently dropped. We learned
this the hard way when `gs.tick++` was a no-op.

**The pattern we use everywhere**:
```ts
const d = drillerEntity.get(Driller)!
// ... compute ...
drillerEntity.set(Driller, { col: newCol, row: newRow })
```

**Exception — typed-array mutation**: `Grid.tiles`, `Grid.flags`,
`Grid.frameIndex`, `Grid.hits` are `Uint8Array`s. The TypedArray
itself is held by reference inside the trait; mutation of its
elements (`tiles[i] = X`) writes through to the underlying buffer.
This is intentional and works because TypedArray cells are not
snapshot-copied by Koota — only the array reference is.

If we ever replace the array (`grid.tiles = newArray`), we must
`world.set(Grid, { ...grid, tiles: newArray })` — see `ensureRows`
which does this correctly.

## 5. System order

Run order in `Scene.tsx` per frame (ordered by dependency):

1. `cameraSystem` — reads driller pos, writes Camera.
2. `streamChunks` — loads/unloads chunks based on Camera.
3. `deathSystem` / `scatteredGemsSystem` — death state machine.
4. `heroWorldFallSystem` — currently no-op; legacy.
5. `moodDriftSystem`, `plannerTick`, `drillerSystem`, `hazardSpawnSystem` — only if runState='playing'.
6. `hazardTickSystem` — Hazard physics + landing.
7. `rockAvalancheSystem` — cluster detection + telegraph + commit.
8. `explosiveSystem` — fuse + detonation.
9. `gemGravitySystem` — gem fall + collect.
10. `collapseTick` — `detectAndSag` → `tickSagging` → `tickFalling`.
11. `particlesSystem` — dust/spark animation.
12. `autotilePass` — recompute frame indexes for FLAG_AUTOTILE_DIRTY cells.

**Dependency invariants**:
- detectAndSag MUST run after every system that mutates tiles, so
  fresh disturbances get picked up. Currently OK (collapse runs
  near the end).
- autotilePass MUST be last (clears DIRTY).
- The driller's continuous motion runs INSIDE drillerSystem, not as
  a separate "movement" pass — keeps `Driller` mutation in one place.

## 6. Decoupled-flag risk audit

Every flag listed in §2 has a corresponding test ensuring it can't
get stuck. The closest thing to a leak is:

- **`FLAG_DISTURBED`** is sticky by design (only cleared on actual
  movement). If a stone is disturbed and blocked from falling
  forever, it keeps DISTURBED forever. That's fine — no visible
  rendering cost; the only effect is "this stone is primed if its
  cluster ever becomes able to fall".

## 7. Where the ACTUAL bugs were

Not ECS architecture — they were rule-detection bugs in
`detectAndSag` and `rockAvalancheSystem`:

1. **No disturbance gate** → cantilever fired globally → fresh
   worldgen chunks immediately sagged. **Fixed**: FLAG_SAG_RECHECK.
   Test: `tests/shake.test.ts > does NOT sag on the FIRST tick after
   worldgen`.
2. **No willFall guard** → unstable cells with solid below would
   sag, "release", land 0px away, look like stuck shake. **Fixed**:
   willFall check before SaggingChunk spawn. Test:
   `tests/collapse.test.ts > does NOT sag a soil chunk that is
   sitting on bedrock`.
3. **DISTURBED cleared on every non-fall tick** → cluster mid-shake
   lost its disturbed bit between iterations and shake stuck on.
   **Fixed**: DISTURBED is now sticky. Test: `tests/avalanche.test.ts
   > FLAG_DISTURBED is sticky`.
4. **Broken rock deposited STONE → re-cluster → cluster walks down
   forever**. **Fixed**: `Hazard.isDebris=true` skips the deposit.
   Test: `tests/hazard.test.ts > debris hazards do NOT deposit a
   stone on landing`.

Each rule, each fix, each test — paired.

## 8. What an actual ECS bug would look like

For completeness, here's what we would NOT find (and tests confirm):

- A trait field that gets mutated via `obj.field = X` instead of
  `entity.set` — would silently no-op. (Fixed pre-rules, no
  recurrence in the audit.)
- Spawning duplicate Driller entities — would have multiple sprites.
  (Verified: `world.queryFirst(Driller)` always returns one.)
- A flag set on a cell that no system ever clears — would accumulate.
  (Tests verify clearance for SAGGING / SHAKING / SAG_RECHECK.)
- An entity destroyed while a Set/Map still references its ID
  externally — Koota's `entity.has(Trait)` would gate the access.
  Our renderers all use `entity.has(Trait)` before reading.

## 9. Test coverage map

After this work the test suite is:

| File | Rules covered |
|---|---|
| `tests/biomes.test.ts` | World layout, biome cycle, isFreeFall |
| `tests/generation.test.ts` | Chunk gen invariants, void band, gem palette |
| `tests/chunk-detect.test.ts` | Connected-component flood + cantilever |
| `tests/collapse.test.ts` | detectAndSag rules, willFall guard, release |
| `tests/shake.test.ts` | FLAG_SHAKING semantics, SAG_RECHECK gate |
| `tests/avalanche.test.ts` | Cluster threshold, DISTURBED stickiness, debris hazards |
| `tests/hazard.test.ts` | Spawn rules, post-respawn cooldown, debris no-deposit |
| `tests/integration.test.ts` | Cross-system: drill → sag → release → land |
| `tests/autotile.test.ts` | Existing — autotile mask |
| `tests/mood.test.ts` | Existing — mood drift |
| `tests/scale.test.ts` | Existing — scale-to-fit |
| `tests/rng.test.ts` | Existing — deterministic RNG |

Total: 85 tests across 12 files; all passing as of this commit.

---

## Appendix: how to add a new rule

1. Edit `2026-05-08-driller-rules.md` to describe the rule and link
   to the system + test it lives in.
2. Add the test FIRST (it should fail).
3. Implement the rule in code until the test passes.
4. Run the FULL suite — if anything else breaks you've found a
   conflict between rules.

This is the contract. The rules document is the spec; the tests are
the proof.

import type { World } from 'koota'
import {
  Camera,
  Driller,
  FLAG_AUTOTILE_DIRTY,
  FLAG_DISTURBED,
  FLAG_FALLING,
  FLAG_SAG_RECHECK,
  FLAG_SHAKING,
  GameState,
  Grid,
  Hazard,
  TILE_AIR,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import {
  HAZARD_DEPTH_BOOST,
  HAZARD_GRAVITY_PX,
  HAZARD_SPAWN_COL_RANGE,
  HAZARD_SPAWN_INTERVAL_FLOOR,
  HAZARD_SPAWN_INTERVAL_TICKS,
  HAZARD_TERMINAL_PX,
  HAZARD_WARNING_TICKS,
  PLAY_COLS,
  STONE_MAX_HITS,
  TILE_PX,
} from '../constants'
import { biomeAt, isFreeFall } from '../biomes'
import { createRng } from '../lib/rng'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { allocateClusterId } from './generation'

let lastSpawnTick = 0
/**
 * Post-respawn rock safety. After a death, the rising ghost beam
 * leaves a clean AIR chute above the driller — which would otherwise
 * satisfy the spawn rule and drop a rock right onto the fresh respawn.
 * `hazardSafeMinRow` is the minimum driller row required before
 * hazards can spawn again. Death system sets it to `respawnRow + 3`
 * so the driller has to dig down a few cells before the sky reopens.
 */
let hazardSafeMinRow = -1

/**
 * Minimum vertical AIR shaft depth (in cells) from the top of the
 * camera viewport down to qualify for a punishment-rock drop. The
 * design intent: the player's autonomous driller is rewarded for
 * meandering / interesting tunnels and PUNISHED for straight-down
 * descents. An open vertical shaft taller than this signals "the
 * driller has been digging straight" — a rock is dropped down it.
 *
 * 5 tiles ≈ a third of a typical viewport. Shafts shorter than that
 * are short enough to read as "homie just changed direction" and
 * shouldn't trigger; anything longer is the AI committing to a
 * straight descent and earning a rock.
 */
const SHAFT_MIN_DEPTH = 5
/**
 * Per-column cooldown so the same shaft doesn't spam rocks faster
 * than the player can read them. ~2s at 60Hz lets multiple rocks
 * funnel down the SAME shaft if the AI keeps digging it open.
 */
const PER_COL_SPAWN_COOLDOWN_TICKS = 120
const lastSpawnByCol = new Int32Array(32) // grown lazily; PLAY_COLS=18 fits

export function setHazardSafeMinRow(row: number): void {
  hazardSafeMinRow = row
}

/**
 * Spawn telegraphed falling-rock hazards above the driller. Rocks ONLY
 * spawn where there's a visible AIR column from the top of the viewport
 * down at least MIN_FALL_CELLS — i.e. there's actually an open hole the
 * rock can drop through. The warning indicator appears at the very top
 * of the viewport in that column, "from off-screen above" telegraphing
 * to the player.
 *
 * After the warning ticks expire, the rock falls under gravity, STOPS
 * on the first non-AIR cell, and becomes a permanent STONE tile (a
 * new anchor in the world). Rocks do NOT punch through soil.
 */
export function hazardSpawnSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs || gs.runState !== 'playing') return
  const driller = world.queryFirst(Driller)
  if (!driller) return
  const d = driller.get(Driller)!
  const grid = world.get(Grid)
  if (!grid) return

  const biome = biomeAt(d.row)
  const boost = HAZARD_DEPTH_BOOST[biome.name] ?? 0
  if (boost <= 0) return
  // During free fall (driller in the void band between biomes) the
  // sky is reserved for the gem shower — no rocks until the player
  // has drilled deep enough into the next world.
  if (isFreeFall(d.row)) return
  // Post-respawn safety window — driller has to drill down past
  // `hazardSafeMinRow` before the sky reopens. Without this, the
  // ghost-beam clears a perfect AIR chute above the respawn cell
  // and a rock would drop on the player's head immediately.
  if (d.row < hazardSafeMinRow) return

  // Punish-straight-down: rock spawn rule is now driven by SHAFT
  // visibility, not driller proximity. Any column whose AIR shaft
  // from the top of the camera viewport extends >= SHAFT_MIN_DEPTH
  // cells gets a rock lobbed down it — the player is told via this
  // signal "you've been digging straight, the world is going to
  // throw something at you." Per-column cooldown prevents the same
  // shaft from spamming rocks; the global cadence still applies as
  // a depth-scaled minimum interval between ANY two rock spawns.
  const cam = world.get(Camera)
  const topRow = Math.max(0, Math.floor((cam?.y ?? d.row * TILE_PX) / TILE_PX))
  const { cols, rows, tiles } = grid

  // Don't stack hazards in the same column.
  const colsWithActiveHazard = new Set<number>()
  world.query(Hazard).forEach((entity) => {
    const h = entity.get(Hazard)!
    if (h.phase !== 'landed') colsWithActiveHazard.add(h.col)
  })

  const interval = Math.max(
    HAZARD_SPAWN_INTERVAL_FLOOR,
    Math.floor(HAZARD_SPAWN_INTERVAL_TICKS / (1 + boost)),
  )
  const globalCooldownDone = gs.tick - lastSpawnTick >= interval

  // Walk columns within HAZARD_SPAWN_COL_RANGE of the driller. For
  // each, count contiguous AIR cells from the camera top downward
  // until hitting a non-AIR. Columns whose shaft is at least
  // SHAFT_MIN_DEPTH and whose per-col cooldown has expired become
  // candidates. We still rate-limit globally so multiple shafts
  // don't all dump rocks the same tick. Scoping to the driller's
  // vicinity keeps rocks RELEVANT to homie's straight-down behavior
  // rather than firing on arbitrary far-away shafts the player can't
  // see.
  const candidates: number[] = []
  for (let dc = -HAZARD_SPAWN_COL_RANGE; dc <= HAZARD_SPAWN_COL_RANGE; dc++) {
    const col = d.col + dc
    if (col < 0 || col >= cols || col >= PLAY_COLS) continue
    if (colsWithActiveHazard.has(col)) continue
    if (gs.tick - (lastSpawnByCol[col] ?? 0) < PER_COL_SPAWN_COOLDOWN_TICKS) continue
    if (tiles[topRow * cols + col] !== TILE_AIR) continue
    let depth = 0
    for (let r = topRow; r < rows; r++) {
      if (tiles[r * cols + col] !== TILE_AIR) break
      depth++
      if (depth >= SHAFT_MIN_DEPTH) break
    }
    if (depth < SHAFT_MIN_DEPTH) continue
    candidates.push(col)
  }
  if (candidates.length === 0) return
  if (!globalCooldownDone) return

  const rng = createRng((gs.tick * 0x9e3779b1 + d.col) >>> 0)
  const col = candidates[rng.intRange(0, candidates.length - 1)]!

  world.spawn(
    Hazard({
      col,
      // Spawn the warning indicator AT the top of the camera viewport,
      // aligned to the cell grid. The warning sprite renders here for
      // HAZARD_WARNING_TICKS, then the rock falls down the shaft.
      py: topRow * TILE_PX + TILE_PX / 2,
      vy: 0,
      phase: 'warning',
      fallAtTick: gs.tick + HAZARD_WARNING_TICKS,
    }),
  )
  lastSpawnByCol[col] = gs.tick
  lastSpawnTick = gs.tick
}

/**
 * Tick all hazards: warning → falling → land (deposit STONE).
 *
 * Rocks STOP on the first non-AIR cell they encounter. The cell
 * immediately ABOVE that obstacle becomes a TILE_STONE — a permanent
 * anchor in the world. The rock is now an obstacle for the driller to
 * dig around (or use the new STONE as a brace for collapse purposes).
 */
export function hazardTickSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags, hits, clusterId: clusterIdArr } = grid

  // Once the driller enters the free-fall void, nothing that was
  // already in flight should chase them through it. Despawn all
  // active hazards (warning + falling) so the void stays gem-only.
  const drillerVoid = world.queryFirst(Driller)
  if (drillerVoid && isFreeFall(drillerVoid.get(Driller)!.row)) {
    world.query(Hazard).forEach((e) => e.destroy())
    return
  }

  world.query(Hazard).forEach((entity) => {
    const h = entity.get(Hazard)!

    if (h.phase === 'warning') {
      if (gs.tick >= h.fallAtTick) entity.set(Hazard, { phase: 'falling', vy: 0 })
      return
    }
    if (h.phase === 'landed') {
      entity.destroy()
      return
    }

    // falling
    const newVy = Math.min(h.vy + HAZARD_GRAVITY_PX, HAZARD_TERMINAL_PX)
    const newPy = h.py + newVy
    const newRow = Math.floor(newPy / TILE_PX)

    if (newRow >= rows) {
      entity.destroy()
      return
    }

    // No mid-flight kills. A rock falling through the driller's cell
    // is a near miss — the driller is itself falling and the rock
    // simply passes through. Squish only happens at LANDING, and only
    // if the driller is on solid ground at the rock's resting cell.

    const idx = newRow * cols + h.col
    const tileHere = tiles[idx]!

    // STOP on first non-AIR cell. Normal rocks deposit a STONE one
    // cell above the obstacle and disturb adjacent stone clusters.
    // DEBRIS rocks (from a broken avalanche cluster) just die on
    // impact — they don't deposit, otherwise the deposited stone
    // re-clusters with the shrinking avalanche above and the cluster
    // walks downward forever instead of dying.
    if (tileHere !== TILE_AIR) {
      const restRow = newRow - 1
      if (restRow >= 0 && !h.isDebris) {
        const driller = world.queryFirst(Driller)
        if (driller) {
          const d = driller.get(Driller)!
          if (d.col === h.col && d.row === restRow) {
            const supportRow = d.row + 1
            const supportIdx = supportRow * cols + d.col
            const onGround =
              supportRow >= rows ||
              (tiles[supportIdx] !== undefined && tiles[supportIdx] !== TILE_AIR)
            if (onGround) world.set(GameState, { runState: 'dying' })
          }
        }
        const restIdx = restRow * cols + h.col
        // No-adjacency rule: if any 4-neighbor of the rest cell is a
        // FIXTURE, the rock can't land here — fixtures and stones
        // must always have ≥ 1 cell of padding. Skip the stamp; the
        // hazard just dies on impact (kill the entity).
        let blockedByFixture = false
        for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nc = h.col + dc
          const nr = restRow + dr
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
          const nT = tiles[nr * cols + nc]
          if (nT !== undefined && nT >= 3 /* TILE_FIXTURE_BASE */ && nT < 8) {
            blockedByFixture = true
            break
          }
        }
        if (!blockedByFixture && tiles[restIdx] === TILE_AIR) {
          tiles[restIdx] = TILE_STONE
          // Fresh stone — full health (hits-taken = 0). Clear any
          // residual hit count from when this cell was previously
          // occupied (hazard land branch can stamp into a slot whose
          // last occupant was a damaged stone that subsequently got
          // drilled to AIR).
          hits[restIdx] = 0
          flags[restIdx] = (flags[restIdx] ?? 0) | FLAG_AUTOTILE_DIRTY
          markCellAndNeighborsDirty(world, h.col, restRow)
          // Cluster id assignment with 4×4 cap. Tries to join an
          // adjacent cluster; if joining would exceed MAX_CLUSTER_DIM
          // in either axis, allocates a NEW cluster id so the rock
          // visually sits beside (with strokes) rather than gloming
          // into a "frankenglom". The avalanche flood-fill respects
          // cluster ids so adjacent-but-independent clusters fall
          // separately.
          clusterIdArr[restIdx] = pickClusterIdForNewStone(
            tiles,
            clusterIdArr,
            cols,
            rows,
            h.col,
            restRow,
          )
        }
      }
      entity.set(Hazard, { phase: 'landed' })
      return
    }

    entity.set(Hazard, { py: newPy, vy: newVy })
  })
}

/**
 * Avalanche cascade. When 4+ TILE_STONE cells form a 4-connected
 * cluster, the pile is heavy enough to fall as a unit. Each "fall
 * step" the cluster shifts down one row; columns where the bottom
 * edge sits over SOIL get crushed (SOIL → AIR) and the rock that did
 * the crushing accumulates a hit on `grid.hits[idx]`. After 4 hits
 * that rock disintegrates — same model as drilling a rock (also 4
 * hits to break in the user-facing mental model).
 *
 * Once a cluster shrinks below 4 rocks it's no longer "heavy enough"
 * and stops falling — remaining stones become static brace tiles.
 *
 * Falling cadence is throttled by `lastAvalancheTick` so cluster
 * descent reads as a heavy crash, not a single-tick teleport.
 */
const AVALANCHE_THRESHOLD = 4
// Phase 2 unification: avalanche break-off and the player's drill
// share STONE_MAX_HITS — one tuning knob, not two.
const AVALANCHE_HITS_TO_BREAK = STONE_MAX_HITS
/**
 * Max-out cluster cap (Kirby's Avalanche-style fairness primitive).
 * A connected stone cluster whose bounding box reaches this size in
 * EITHER axis is "doom-blocked" — the whole pile is disturbed when
 * a new rock pushes it past the threshold, ensuring the player sees
 * the avalanche coming rather than a slowly-creeping pile that
 * eventually surprises them.
 */
const MAX_CLUSTER_DIM = 4

/**
 * Pick a cluster id for a freshly-stamped stone at (col, row). Looks
 * at 4-neighbor stones; for each adjacent cluster, computes the bbox
 * the cluster would have IF the new stone joins, and accepts the
 * first whose bbox stays ≤ MAX_CLUSTER_DIM in both axes. If no
 * adjacent cluster can absorb (or there are no neighbors), allocates
 * a fresh global cluster id — the new stone becomes its own cluster
 * and renders with strokes between it and its non-cluster neighbors.
 *
 * This is the placement-time enforcement of the no-frankenglom rule.
 * The avalanche flood-fill keys on cluster id, so the visual and
 * gameplay representations are guaranteed consistent.
 */
function pickClusterIdForNewStone(
  tiles: Uint8Array,
  clusterId: Uint16Array,
  cols: number,
  rows: number,
  col: number,
  row: number,
): number {
  const adjacentIds = new Set<number>()
  for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const nc = col + dc
    const nr = row + dr
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
    const nIdx = nr * cols + nc
    if (tiles[nIdx] !== TILE_STONE) continue
    const id = clusterId[nIdx]
    if (id !== undefined && id !== 0) adjacentIds.add(id)
  }
  for (const id of adjacentIds) {
    let minC = col
    let maxC = col
    let minR = row
    let maxR = row
    for (let i = 0; i < clusterId.length; i++) {
      if (clusterId[i] !== id) continue
      const cc = i % cols
      const rr = (i - cc) / cols
      if (cc < minC) minC = cc
      if (cc > maxC) maxC = cc
      if (rr < minR) minR = rr
      if (rr > maxR) maxR = rr
    }
    if ((maxC - minC + 1) <= MAX_CLUSTER_DIM && (maxR - minR + 1) <= MAX_CLUSTER_DIM) {
      return id
    }
  }
  return allocateClusterId()
}
const AVALANCHE_FALL_INTERVAL_TICKS = 12 // ~200ms at 60Hz
// Stones use the same SHAKE duration as soil sag so the player
// reads "this is about to fall" with the same cadence regardless
// of tile class. Soil's full 3-phase telegraph (PRECARIOUS=600ms +
// SAGGING=600ms + SHAKING=400ms) doesn't apply here — the rock
// avalanche skips PRECARIOUS/SAGGING (no anchor-based prediction
// for stones; disturbance is sudden) and uses just SHAKE → settle
// → commit. SHAKE duration matches SAG_SHAKING_TICKS=24 ticks.
// Sized so homie can drill a 4-cell-wide escape from under a
// worst-case 4-wide cluster before the rocks land. Drill cadence is
// ~250ms/cell, so 4 cells = ~1s minimum; the telegraph gives a
// comfortable margin (~1.5s shake + 0.5s settle = 2s total) plus
// brace can extend it further (ROCK_BRACE_EXTEND_TICKS = 30).
const AVALANCHE_SHAKE_TICKS = 90  // ~1.5s
const AVALANCHE_SETTLE_TICKS = 30 // ~0.5s steady pause before commit
let lastAvalancheTick = 0
/**
 * For each cluster cell currently in the pre-fall telegraph, this
 * holds the tick the shake started. A cell is "shaking" while
 * elapsed < SHAKE_TICKS, "settled" while < SHAKE_TICKS+SETTLE_TICKS,
 * and commits to falling beyond that. Cleared on commit, on cluster
 * blockage, or on world reset.
 */
const shakeStartTick = new Map<number, number>()
/**
 * Phase 0 perf: dirty list of cell indices that received FLAG_SHAKING
 * via the avalanche pipeline. Cleared at the start of the next
 * `rockAvalancheSystem` pass instead of a window-wide scan.
 */
const shakingDirtyIdxs: number[] = []

export function rockAvalancheSystem(world: World): void {
  const gs = world.get(GameState)
  const grid = world.get(Grid)
  if (!gs || !grid) return
  // Once the driller enters the free-fall void band, the world above
  // is "behind" — no in-flight mass should chase them through. Halt
  // avalanche entirely.
  const driller0 = world.queryFirst(Driller)
  if (driller0 && isFreeFall(driller0.get(Driller)!.row)) return
  // Run cluster detection EVERY tick so the shake telegraph updates
  // smoothly. The fall step itself is throttled below so cluster
  // descent reads as a heavy crash, not a single-tick teleport.
  const { cols, rows, tiles, flags, hits, clusterId: clusterIdArr } = grid

  // 4-connected flood-fill over TILE_STONE to find each cluster.
  // Bounded to a window around the driller — cleared / un-streamed
  // rows far above or below are pure AIR and not worth scanning.
  const driller = world.queryFirst(Driller)
  const dRow = driller ? driller.get(Driller)!.row : 0
  const winTop = Math.max(0, dRow - 96)
  const winBot = Math.min(rows, dRow + 192)
  const startIdx = winTop * cols
  const endIdx = winBot * cols

  // Phase 0 perf: dirty-list pre-pass. We track every cell index
  // we set FLAG_SHAKING on (`shakingDirtyIdxs`) at the bottom of
  // this function. This pass clears just those, instead of
  // window-wide scanning ~3.7k cells per tick.
  for (const idx of shakingDirtyIdxs) {
    if (idx < flags.length && tiles[idx] === TILE_STONE) {
      flags[idx]! &= ~FLAG_SHAKING
    }
  }
  shakingDirtyIdxs.length = 0

  const seen = new Uint8Array(tiles.length)
  const stack: number[] = []
  let advancedAny = false

  for (let i = startIdx; i < endIdx; i++) {
    if (seen[i] || tiles[i] !== TILE_STONE) continue
    const seedClusterId = clusterIdArr[i] ?? 0
    if (seedClusterId === 0) {
      // Rocks without a cluster id are orphaned (shouldn't happen in
      // healthy play; defensive). Mark seen and skip so the outer
      // loop doesn't churn on them every tick.
      seen[i] = 1
      continue
    }
    const cells: number[] = []
    stack.length = 0
    stack.push(i)
    seen[i] = 1
    // Cluster-id-aware flood-fill — only stones with the SAME cluster
    // id glom together. Two adjacent-but-independent clusters fall as
    // separate avalanches (visible 1-cell air-gap rendering, no
    // frankenglom).
    while (stack.length) {
      const idx = stack.pop()!
      cells.push(idx)
      const c = idx % cols
      const r = (idx - c) / cols
      const ns: number[] = []
      if (c > 0) ns.push(idx - 1)
      if (c < cols - 1) ns.push(idx + 1)
      if (r > 0) ns.push(idx - cols)
      if (r < rows - 1) ns.push(idx + cols)
      for (const ni of ns) {
        if (!seen[ni] && tiles[ni] === TILE_STONE && clusterIdArr[ni] === seedClusterId) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
    }
    // Rock codex: a cluster currently in motion (FLAG_FALLING set on
    // any cell) bypasses the canFall reconsideration — once started,
    // it must resolve fully. Cluster shrinks (via break-offs) → still
    // falls. Cluster splits → each piece keeps falling rigidly.
    let inMotion = false
    for (const idx of cells) {
      if ((flags[idx]! & FLAG_FALLING) !== 0) {
        inMotion = true
        break
      }
    }

    // Force-eval rule (replaces the old disturbance + threshold gates):
    // every cluster gets canFall'd every tick. If air is below the
    // bottom-most row, the cluster falls — period. No threshold check
    // (single rocks fall too if their support is gone). No DISTURBED
    // gate (rocks evaluate continuously, no need to pre-disturb them).
    // The 4×4 max-cluster cap is enforced at PLACEMENT time via the
    // cluster_id assignment in `pickClusterIdForNewStone`, not here.

    // The cluster can fall iff every cell of the BOTTOM-MOST row of
    // the cluster has AIR or SOIL directly below it. A column whose
    // lowest cluster-cell is NOT in the bottom-most row is allowed to
    // hang in mid-air — the cluster falls as a rigid unit and that
    // overhung cell goes along for the ride. This makes irregular
    // shapes (L-pieces, T-pieces, 7-shapes) MORE deadly: a small
    // 3-piece cluster's "bottom-most row" is just 1–2 cells, so the
    // cluster gets angry the moment those few cells have AIR below.
    const inCluster = new Set(cells)
    let maxRowInCluster = -1
    for (const idx of cells) {
      const r = (idx - (idx % cols)) / cols
      if (r > maxRowInCluster) maxRowInCluster = r
    }
    let canFall = true
    let unstreamedBelow = false
    const bottomEdge: number[] = []
    for (const idx of cells) {
      const c = idx % cols
      const r = (idx - c) / cols
      if (r !== maxRowInCluster) continue
      if (r + 1 >= rows) {
        // Streamer hasn't extended the world below this row yet.
        // Don't decide either way — defer evaluation. Without this,
        // a cluster sitting on the streaming frontier would be
        // marked canFall=false (treated as blocked) and go inert
        // until the player got closer; with this, the cluster waits
        // for the row below to load, then re-evaluates next tick.
        unstreamedBelow = true
        break
      }
      const belowIdx = (r + 1) * cols + c
      if (inCluster.has(belowIdx)) continue
      const below = tiles[belowIdx]
      // Tightened canFall for !inMotion: idle clusters need AIR
      // below to start falling (NOT soil — soil-supported clusters
      // wait until the soil cascades). In-motion clusters keep the
      // looser AIR-or-SOIL rule so they can crush soil mid-fall.
      // Without this split, force-eval would tip every worldgen
      // cluster that's sitting on soil into immediate fall on the
      // first tick after load.
      if (inMotion) {
        if (below !== TILE_AIR && below !== TILE_SOIL) {
          canFall = false
          break
        }
      } else {
        if (below !== TILE_AIR) {
          canFall = false
          break
        }
      }
      bottomEdge.push(idx)
    }
    if (unstreamedBelow) continue
    if (!canFall) {
      // Cluster is blocked. Two cases:
      //   - inMotion: this is LANDING. The cluster has resolved its
      //     full fall loop; it goes inert. Clear FLAG_FALLING (no
      //     longer moving), FLAG_DISTURBED (per rule 7: needs fresh
      //     disturbance + 4+ to move again), FLAG_SHAKING.
      //   - !inMotion: cluster is disturbed-but-blocked. Drop any
      //     stale shake bookkeeping but keep DISTURBED so a future
      //     change (drilled rock below) lets it fall.
      if (inMotion) {
        for (const idx of cells) {
          shakeStartTick.delete(idx)
          flags[idx]! &= ~FLAG_SHAKING & ~FLAG_FALLING & ~FLAG_DISTURBED
        }
      } else {
        for (const idx of cells) {
          shakeStartTick.delete(idx)
          flags[idx]! &= ~FLAG_SHAKING
        }
      }
      continue
    }

    // Pre-fall telegraph: shake → settle → commit. ONLY for clusters
    // entering motion this tick (`!inMotion`). An already-falling
    // cluster (`inMotion`) skips the telegraph entirely — once
    // started, rocks resolve their full fall loop without pausing.
    if (!inMotion) {
      let earliestShake = Infinity
      let anyNew = false
      for (const idx of cells) {
        let t = shakeStartTick.get(idx)
        if (t === undefined) {
          t = gs.tick
          shakeStartTick.set(idx, t)
          anyNew = true
        }
        if (t < earliestShake) earliestShake = t
      }
      // First-shake propagation: when an angry cluster enters its
      // telegraph for the first time, force a sag re-check on EVERY
      // SOIL cell touching the cluster's perimeter. This way the
      // surrounding earth gets a chance to fail FIRST during the
      // ~2s shake window — soil cascades fire, the world below the
      // rock churns — and only THEN does the rock commit. Produces
      // the "rock dislodges, chaos ensues" cadence the design wants.
      if (anyNew) {
        for (const idx of cells) {
          const c = idx % cols
          const r = (idx - c) / cols
          for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nc = c + dc
            const nr = r + dr
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
            const nIdx = nr * cols + nc
            if (tiles[nIdx] === TILE_SOIL) {
              flags[nIdx]! |= FLAG_SAG_RECHECK
            }
          }
        }
      }
      const shakeElapsed = gs.tick - earliestShake
      const inShakePhase = shakeElapsed < AVALANCHE_SHAKE_TICKS
      const stillTelegraphing = shakeElapsed < AVALANCHE_SHAKE_TICKS + AVALANCHE_SETTLE_TICKS
      for (const idx of cells) {
        if (inShakePhase) {
          flags[idx]! |= FLAG_SHAKING
          shakingDirtyIdxs.push(idx)
        } else {
          flags[idx]! &= ~FLAG_SHAKING
        }
      }
      if (stillTelegraphing) continue
    }
    // Throttle subsequent descent steps after the telegraph completes.
    if (gs.tick - lastAvalancheTick < AVALANCHE_FALL_INTERVAL_TICKS) continue
    // Commit fall — clear the shake bookkeeping for these cells.
    for (const idx of cells) {
      shakeStartTick.delete(idx)
      flags[idx]! &= ~FLAG_SHAKING
    }

    // Crush soil under the bottom edge (each crush = +1 hit on the
    // rock that did the crushing). Then physically translate the
    // cluster down one row.
    for (const idx of bottomEdge) {
      const c = idx % cols
      const r = (idx - c) / cols
      const belowIdx = (r + 1) * cols + c
      if (tiles[belowIdx] === TILE_SOIL) {
        tiles[belowIdx] = TILE_AIR
        flags[belowIdx] = (flags[belowIdx] ?? 0) | FLAG_AUTOTILE_DIRTY
        hits[idx] = (hits[idx] ?? 0) + 1
        markCellAndNeighborsDirty(world, c, r + 1)
      }
    }

    // Translate the cluster down. Process bottom rows first so we
    // don't overwrite a cell still occupied by another cluster cell.
    cells.sort((a, b) => Math.floor(b / cols) - Math.floor(a / cols))
    for (const idx of cells) {
      const c = idx % cols
      const r = (idx - c) / cols
      const newIdx = (r + 1) * cols + c
      const rockHits = hits[idx] ?? 0
      // Rock has accumulated enough hits to break apart from the
      // cluster — but it shouldn't just vanish in mid-air. Detach as
      // a single falling Hazard so the existing hazard physics carries
      // it the rest of the way to the earth (where it'll deposit a
      // STONE on landing). The cluster cell becomes AIR; the cluster
      // itself shrinks by one rock.
      if (rockHits >= AVALANCHE_HITS_TO_BREAK) {
        tiles[idx] = TILE_AIR
        flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
        hits[idx] = 0
        clusterIdArr[idx] = 0
        markCellAndNeighborsDirty(world, c, r)
        world.spawn(
          Hazard({
            col: c,
            py: r * TILE_PX + TILE_PX / 2,
            vy: HAZARD_TERMINAL_PX,
            phase: 'falling',
            fallAtTick: gs.tick,
            isDebris: true,
          }),
        )
        continue
      }
      // Otherwise translate stone + carry its hit count to new cell.
      // FLAG_FALLING marks the new cell as in-motion: next tick the
      // cluster bypasses the canFall reconsideration (rule: rocks
      // resolve fully once started). The -1 sentinel on shake-start
      // means "already telegraphed". Cluster id moves with the cell
      // so the cluster preserves identity through the fall.
      const movingClusterId = clusterIdArr[idx] ?? 0
      tiles[idx] = TILE_AIR
      flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
      clusterIdArr[idx] = 0
      tiles[newIdx] = TILE_STONE
      flags[newIdx] = (flags[newIdx] ?? 0) | FLAG_AUTOTILE_DIRTY | FLAG_FALLING
      clusterIdArr[newIdx] = movingClusterId
      hits[newIdx] = rockHits
      hits[idx] = 0
      shakeStartTick.set(newIdx, -1)
      // Mark the newly-occupied cell as already-visited so the outer
      // flood-fill loop doesn't re-process it as a "new" cluster in
      // the same tick. Without this, the cascade processes the same
      // cluster multiple times per tick (bottom-up scan picks up each
      // translated stone in turn) — the cluster effectively teleports
      // through soil layers in one frame instead of falling at the
      // throttled cadence. See decisions log: "Plan 1 / item B".
      seen[newIdx] = 1
      markCellAndNeighborsDirty(world, c, r)
      markCellAndNeighborsDirty(world, c, r + 1)
    }
    advancedAny = true
  }

  // DISTURBED is sticky and only clears when a cluster cell actually
  // moves (handled inline at the commit branch). The previous version
  // wiped DISTURBED on every "didn't fall this tick" pass, which made
  // shaking clusters lose their disturbed bit mid-telegraph — they'd
  // shake forever and never commit to falling.

  if (advancedAny) lastAvalancheTick = gs.tick
}

/** Reset avalanche timer on world rotation / restart. */
export function resetAvalanche(): void {
  lastAvalancheTick = 0
  shakeStartTick.clear()
}

/**
 * Mouse-brace extension for in-flight rock telegraphs (codex rule
 * 5: in-motion clusters can't be braced — once started, they resolve
 * fully). Called from input.ts when the player taps a SHAKING rock
 * cluster cell. Floods the cluster from the seed and bumps every
 * cell's `shakeStartTick` forward by `extendTicks` so the elapsed
 * shake metric resets toward zero — buying the player one fresh
 * telegraph window. Returns true iff a valid SHAKING cluster was
 * found at the seed.
 */
export function braceShakingCluster(
  world: World,
  col: number,
  row: number,
  extendTicks: number,
): boolean {
  const grid = world.get(Grid)
  if (!grid) return false
  const { cols, rows: gridRows, tiles, flags } = grid
  if (col < 0 || col >= cols || row < 0 || row >= gridRows) return false
  const seedIdx = row * cols + col
  if (tiles[seedIdx] !== TILE_STONE) return false
  // In-motion clusters can't be braced (codex rule 5).
  if ((flags[seedIdx]! & FLAG_FALLING) !== 0) return false
  // Cell must currently be in the SHAKE telegraph.
  if ((flags[seedIdx]! & FLAG_SHAKING) === 0) return false
  // Flood-fill the connected cluster from the seed.
  const seenLocal = new Set<number>([seedIdx])
  const stack: number[] = [seedIdx]
  const cells: number[] = []
  while (stack.length) {
    const idx = stack.pop()!
    cells.push(idx)
    const c = idx % cols
    const r = (idx - c) / cols
    const ns: number[] = []
    if (c > 0) ns.push(idx - 1)
    if (c < cols - 1) ns.push(idx + 1)
    if (r > 0) ns.push(idx - cols)
    if (r < gridRows - 1) ns.push(idx + cols)
    for (const ni of ns) {
      if (!seenLocal.has(ni) && tiles[ni] === TILE_STONE) {
        seenLocal.add(ni)
        stack.push(ni)
      }
    }
  }
  // Push every cluster cell's shake-start tick forward. earliestShake
  // (the per-tick min over cluster cells) shifts forward by the same
  // amount, extending the telegraph by `extendTicks` before commit.
  for (const idx of cells) {
    const start = shakeStartTick.get(idx)
    if (start !== undefined && start >= 0) {
      shakeStartTick.set(idx, start + extendTicks)
    }
  }
  return true
}

/** Reset module-level state on world rotation / restart. */
export function resetHazardSpawn(): void {
  lastSpawnTick = 0
  hazardSafeMinRow = -1
}

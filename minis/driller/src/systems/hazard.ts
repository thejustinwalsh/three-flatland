import type { Entity, World } from 'koota'
import {
  Camera,
  Drag,
  Driller,
  FLAG_AUTOTILE_DIRTY,
  FLAG_FALLING,
  FLAG_SHAKING,
  GameState,
  Grid,
  Hazard,
  RockCluster,
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
import { biomeAt, isFreeFall, WORLD_LENGTH_ROWS } from '../biomes'
import { createRng } from '../lib/rng'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { allocateClusterId } from './generation'
import { playSound } from './sounds'

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
 * Minimum number of rows the driller must have DUG below the current
 * biome's surface before a punishment rock can spawn in that column.
 *
 * Previously this counted contiguous AIR cells from the camera-top
 * row downward, which conflated three different "AIR" sources:
 *   1. Sky / void band above the biome's natural surface,
 *   2. Ghost-beam chutes carved on death,
 *   3. Actual tunnels the driller dug.
 *
 * Only #3 should attract rocks. The new gate uses
 * `firstSolidRow - biomeSurfaceRow ≥ MIN_DUG_DEPTH` — i.e. the first
 * non-AIR cell going down from the camera top must be at least 4 rows
 * BELOW the biome's first row. Consequences:
 *   - Pristine biome surface (no tunnel) → firstSolid = biomeSurface,
 *     dugDepth = 0 → no spawn.
 *   - Ghost chute (no solid above driller at all) → firstSolid = -1
 *     → no spawn. Rocks can't ride ghost chutes back down.
 *   - Tunneled column → firstSolid sits inside the dug tunnel → spawn
 *     eligible once dugDepth ≥ 4. The rock falls into the tunnel and
 *     lands at its bottom (a hole), never on top of the surface.
 */
const MIN_DUG_DEPTH = 4
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
    Math.floor(HAZARD_SPAWN_INTERVAL_TICKS / (1 + boost))
  )
  const globalCooldownDone = gs.tick - lastSpawnTick >= interval

  // Per-column dug-depth gate (see MIN_DUG_DEPTH for rationale).
  // The biome's surface row is the first row of the current biome
  // body. We require the column's first solid cell (where the rock
  // would land) to sit at least MIN_DUG_DEPTH below that surface —
  // proving the driller actually dug here. Sky/void AIR above the
  // surface no longer qualifies; ghost chutes (no solid found) skip.
  const biomeSurfaceRow = Math.floor(d.row / WORLD_LENGTH_ROWS) * WORLD_LENGTH_ROWS
  const candidates: number[] = []
  for (let dc = -HAZARD_SPAWN_COL_RANGE; dc <= HAZARD_SPAWN_COL_RANGE; dc++) {
    const col = d.col + dc
    if (col < 0 || col >= cols || col >= PLAY_COLS) continue
    if (colsWithActiveHazard.has(col)) continue
    if (gs.tick - (lastSpawnByCol[col] ?? 0) < PER_COL_SPAWN_COOLDOWN_TICKS) continue
    if (tiles[topRow * cols + col] !== TILE_AIR) continue
    let firstSolid = -1
    for (let r = topRow; r < rows; r++) {
      if (tiles[r * cols + col] !== TILE_AIR) {
        firstSolid = r
        break
      }
    }
    if (firstSolid === -1) continue // ghost chute / nothing solid → skip
    if (firstSolid - biomeSurfaceRow < MIN_DUG_DEPTH) continue
    // Stack-saturation cutoff: a rock lands at firstSolid - 1. If
    // that lands ABOVE the driller's row (firstSolid <= d.row), the
    // rock has no chance of hitting him — it just piles uselessly
    // on top of previous stones. Stop spawning in saturated columns.
    if (firstSolid <= d.row) continue
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
    })
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
      if (gs.tick >= h.fallAtTick) {
        entity.set(Hazard, { phase: 'falling', vy: 0 })
        playSound(world, 'blockFall')
      }
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
      playSound(world, 'blockLand')
      const restRow = newRow - 1
      if (restRow >= 0 && !h.isDebris) {
        const driller = world.queryFirst(Driller)
        if (driller) {
          const d = driller.get(Driller)!
          // Rock-on-head ALWAYS kills, even mid-fall. The previous
          // onGround gate let the driller "play chicken" with a rock
          // by jumping into a hole as it landed; that's been removed
          // — if the rock's rest cell is the driller's cell, it's a
          // direct hit and a kill.
          if (d.col === h.col && d.row === restRow) {
            world.set(GameState, { runState: 'dying' })
          }
        }
        const restIdx = restRow * cols + h.col
        // No-adjacency rule: if any 4-neighbor of the rest cell is a
        // FIXTURE, the rock can't land here — fixtures and stones
        // must always have ≥ 1 cell of padding. Skip the stamp; the
        // hazard just dies on impact (kill the entity).
        let blockedByFixture = false
        for (const [dc, dr] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
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
            restRow
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
// Avalanche break-off and the player's drill
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
  row: number
): number {
  const adjacentIds = new Set<number>()
  for (const [dc, dr] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
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
    if (maxC - minC + 1 <= MAX_CLUSTER_DIM && maxR - minR + 1 <= MAX_CLUSTER_DIM) {
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
const AVALANCHE_SHAKE_TICKS = 90 // ~1.5s
const AVALANCHE_SETTLE_TICKS = 30 // ~0.5s steady pause before commit
/**
 * Visible-shake commit threshold (ticks). Once a cluster's shake has
 * been continuously telegraphing for this long, it's visually committed
 * per the player's perception — the codex rule 1 contract kicks in
 * ("anything that visually shakes must fall by ≥1 cell"). If canFall
 * flips false past this threshold, we partial-fall the columns that can
 * still drop instead of retracting the shake. Set well above the
 * human change-detection threshold (~150ms ≈ 9 ticks at 60Hz) so the
 * sub-perceptual 1–2-tick FLAG_SHAKING blips don't trigger the strict
 * commit semantics.
 */
const SHAKE_VISIBLE_COMMIT_TICKS = 10
let lastAvalancheTick = 0

/**
 * Per-cluster shake-start state lives on the `RockCluster` entity
 * The entity's `shakeStartTick` is:
 *   - 0   if the cluster isn't currently telegraphing
 *   - >0  the tick at which shake first began (cluster-wide minimum)
 *   - -1  "skip telegraph" sentinel set on cells freshly placed by an
 *         in-motion fall, so newly-landed clusters don't waste 1.5s
 *         re-telegraphing before falling again.
 *
 * Helpers below build a per-tick `cid → Entity` lookup so the
 * avalanche loop reads / writes cluster state in O(1). Cleanup at the
 * end of `rockAvalancheSystem` destroys entities whose cluster id
 * wasn't seen this tick (cells vaporized, broke off as Hazard debris,
 * etc.).
 */
function buildClusterEntityMap(world: World): Map<number, Entity> {
  const map = new Map<number, Entity>()
  world.query(RockCluster).forEach((e) => {
    const rc = e.get(RockCluster)
    if (rc) map.set(rc.clusterId, e)
  })
  return map
}
function getClusterShake(map: Map<number, Entity>, cid: number): number {
  const e = map.get(cid)
  return e ? (e.get(RockCluster)?.shakeStartTick ?? 0) : 0
}
function setClusterShake(world: World, map: Map<number, Entity>, cid: number, value: number): void {
  let e = map.get(cid)
  if (!e) {
    if (value === 0) return
    e = world.spawn(RockCluster({ clusterId: cid, shakeStartTick: value }))
    map.set(cid, e)
    return
  }
  if (value === 0) {
    e.destroy()
    map.delete(cid)
    return
  }
  e.set(RockCluster, { shakeStartTick: value })
}
/**
 * Dirty list of cell indices that received FLAG_SHAKING
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

  // Build the per-cluster entity lookup once for this tick. Cluster-id →
  // RockCluster entity mapping; reads / writes inside
  // the per-cluster loop go through getClusterShake / setClusterShake
  // which keep the map in sync as entities are spawned or destroyed.
  // Track which cluster ids we touched so we can destroy stale
  // entities (clusters with no remaining cells) at the end.
  const clusterEntityByCid = buildClusterEntityMap(world)
  const seenClusterIds = new Set<number>()

  // 4-connected flood-fill over TILE_STONE to find each cluster.
  // Bounded to a window around the driller — cleared / un-streamed
  // rows far above or below are pure AIR and not worth scanning.
  const driller = world.queryFirst(Driller)
  const dRow = driller ? driller.get(Driller)!.row : 0
  const winTop = Math.max(0, dRow - 96)
  const winBot = Math.min(rows, dRow + 192)
  const startIdx = winTop * cols
  const endIdx = winBot * cols

  // Dirty-list pre-pass. We track every cell index
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
  const processedClusterIds = new Set<number>()
  let advancedAny = false

  // The cluster currently being held by the player's drag — gravity
  // is suspended for it; the drag system owns its position. Without
  // this gate, the avalanche re-applies FLAG_FALLING every tick to
  // any mid-air cluster, undoing the drag's flag-clear pause.
  const dragHeld = world.get(Drag)
  const heldClusterId = dragHeld?.clusterId ?? 0

  for (let i = startIdx; i < endIdx; i++) {
    if (seen[i] || tiles[i] !== TILE_STONE) continue
    let seedClusterId = clusterIdArr[i] ?? 0
    if (seedClusterId === 0) {
      // Rocks without a cluster id are orphaned (shouldn't happen in
      // healthy play; defensive). Mark seen and skip so the outer
      // loop doesn't churn on them every tick.
      seen[i] = 1
      continue
    }
    if (heldClusterId !== 0 && seedClusterId === heldClusterId) {
      // Player is dragging this cluster — drag system owns it.
      // Mark all cluster cells as seen so the outer loop skips them.
      seen[i] = 1
      // Held cluster's entity stays alive even though we don't process
      // it — record so the post-loop cleanup doesn't reap it.
      seenClusterIds.add(seedClusterId)
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

    // A translated or partially-fallen cluster can split into multiple
    // disconnected components while its cells still carry the original
    // cluster id. RockCluster timing is keyed by that id, so processing a
    // blocked component after a fallable one used to clear the shared
    // shakeStartTick every frame. The fallable piece then restarted its
    // telegraph forever and Homie paced underneath it indefinitely.
    //
    // Give every disconnected component its own identity as soon as the
    // split is observed. Copy the inherited shake state so a piece that
    // already telegraphed does not pay for a second warning window.
    if (processedClusterIds.has(seedClusterId)) {
      const inheritedShake = getClusterShake(clusterEntityByCid, seedClusterId)
      seedClusterId = allocateClusterId()
      for (const idx of cells) clusterIdArr[idx] = seedClusterId
      if (inheritedShake !== 0) {
        setClusterShake(world, clusterEntityByCid, seedClusterId, inheritedShake)
      }
    }
    processedClusterIds.add(seedClusterId)
    seenClusterIds.add(seedClusterId)

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

    // canFall: every exposed bottom cell needs AIR (idle) or AIR/SOIL
    // (in-motion crushing through soil) directly below. This is
    // column-local: an L-shaped cluster can have multiple bottom rows.
    // Defer if the streaming frontier hasn't extended below the
    // bottom-most row yet.
    const inCluster = new Set(cells)
    let canFall = true
    let unstreamedBelow = false
    const bottomEdge: number[] = []
    for (const idx of cells) {
      const c = idx % cols
      const r = (idx - c) / cols
      if (r + 1 >= rows) {
        unstreamedBelow = true
        break
      }
      const belowIdx = (r + 1) * cols + c
      if (inCluster.has(belowIdx)) continue
      const below = tiles[belowIdx]
      // In-motion clusters keep crushing through SOIL; idle clusters
      // need AIR-only below to start. Without the split a cluster
      // sitting on natural-worldgen soil would tip into immediate
      // fall on the first tick after pre-settle.
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
      // Codex rule 1 fallback. The naive retract — clearing
      // FLAG_SHAKING on every cluster cell — leaves cells that
      // visually shook but didn't fall. If the cluster has been
      // telegraphing past the visible-commit threshold, force a
      // partial fall instead: any column whose bottom cluster cell
      // has TILE_AIR directly below moves DOWN one row (whole column,
      // top to bottom). Columns with blocked bottoms stay put.
      //
      // Cells that stay are residual codex violators (shake without
      // motion), but bounded to the blocked-column tail rather than
      // the entire cluster. The previous behavior retracted the WHOLE
      // shake on any canFall=false flip — that was the bug.
      //
      // `inMotion` clusters bypass this: their FLAG_FALLING gate at
      // line 514-524 owns motion entirely, and the codex rule 5
      // (rocks resolve fully once started) is enforced elsewhere.
      // Per-cluster shake state lives on the RockCluster entity now.
      // earliestShake > 0 means actively shaking; -1 sentinel means
      // "skip telegraph" (set on in-motion moves) and must NOT count
      // as visibly committed — those cells never visually shook.
      const clusterShake = !inMotion ? getClusterShake(clusterEntityByCid, seedClusterId) : 0
      const anyTelegraphed = clusterShake > 0
      const visiblyCommitted =
        anyTelegraphed && gs.tick - clusterShake >= SHAKE_VISIBLE_COMMIT_TICKS

      if (visiblyCommitted) {
        // Group cluster cells by column. Move whole columns down by
        // 1 row when the bottom-most cell has AIR below; leave
        // blocked columns in place.
        const cellsByCol = new Map<number, number[]>()
        for (const idx of cells) {
          const c = idx % cols
          let arr = cellsByCol.get(c)
          if (!arr) {
            arr = []
            cellsByCol.set(c, arr)
          }
          arr.push(idx)
        }
        const stayedCells: number[] = []
        for (const [c, colCells] of cellsByCol) {
          let bottomIdx = colCells[0]!
          for (const idx of colCells) if (idx > bottomIdx) bottomIdx = idx
          const r = Math.floor(bottomIdx / cols)
          if (r + 1 >= rows) {
            for (const idx of colCells) stayedCells.push(idx)
            continue
          }
          const belowIdx = (r + 1) * cols + c
          if (tiles[belowIdx] !== TILE_AIR) {
            for (const idx of colCells) stayedCells.push(idx)
            continue
          }
          // Column-wise partial fall. Snapshot, clear, write — same
          // pattern as the rigid-cluster move below.
          const moves: { from: number; to: number; hits: number; cid: number }[] = colCells.map(
            (idx) => ({
              from: idx,
              to: idx + cols, // 1 row down = +cols indices
              hits: hits[idx] ?? 0,
              cid: clusterIdArr[idx] ?? 0,
            })
          )
          for (const m of moves) {
            tiles[m.from] = TILE_AIR
            flags[m.from] =
              ((flags[m.from] ?? 0) & ~FLAG_SHAKING & ~FLAG_FALLING) | FLAG_AUTOTILE_DIRTY
            hits[m.from] = 0
            clusterIdArr[m.from] = 0
          }
          for (const m of moves) {
            tiles[m.to] = TILE_STONE
            flags[m.to] = (flags[m.to] ?? 0) | FLAG_FALLING | FLAG_AUTOTILE_DIRTY
            hits[m.to] = m.hits
            clusterIdArr[m.to] = m.cid
          }
          for (const m of moves) {
            const sc = m.from % cols
            const sr = Math.floor(m.from / cols)
            const tc = m.to % cols
            const tr = Math.floor(m.to / cols)
            markCellAndNeighborsDirty(world, sc, sr)
            markCellAndNeighborsDirty(world, tc, tr)
          }
        }
        // Residual: cells in fully-blocked columns. Codex violators
        // (shake without fall) — accept as the strictly-better-than-
        // retract tail.
        for (const idx of stayedCells) {
          flags[idx]! &= ~FLAG_SHAKING
        }
        // Cluster's per-cluster shake state is cleared — the moved
        // cells carry FLAG_FALLING (next tick: inMotion=true) and the
        // stayed cells are inert. The cluster entity will be reaped
        // at end-of-tick cleanup if no cells remain with its id.
        setClusterShake(world, clusterEntityByCid, seedClusterId, 0)
        advancedAny = true
        continue
      }

      // Not visibly committed (sub-perceptual shake) OR already in
      // motion — retract / clear as before. The brief FLAG_SHAKING is
      // below the human change-detection threshold and the renderer's
      // jitter animation hasn't started; no codex breach to undo.
      for (const idx of cells) {
        if (inMotion) {
          flags[idx]! &= ~FLAG_SHAKING & ~FLAG_FALLING
        } else {
          flags[idx]! &= ~FLAG_SHAKING
        }
      }
      setClusterShake(world, clusterEntityByCid, seedClusterId, 0)
      continue
    }

    // Pre-fall telegraph: shake → settle → commit. ONLY for clusters
    // entering motion this tick (`!inMotion`). An already-falling
    // cluster (`inMotion`) skips the telegraph entirely — once
    // started, rocks resolve their full fall loop without pausing.
    if (!inMotion) {
      // Per-cluster shakeStartTick lives on the
      // RockCluster entity. First-time-seen cluster lazily allocates
      // the entity at gs.tick; subsequent ticks read the existing
      // value (preserving the earliest shake). -1 sentinel (set on
      // in-motion moves) is treated as "already telegraphed" — the
      // shakeElapsed becomes huge and the cluster skips the visible
      // shake window, falling immediately when canFall=true.
      let earliestShake = getClusterShake(clusterEntityByCid, seedClusterId)
      if (earliestShake === 0) {
        earliestShake = gs.tick
        setClusterShake(world, clusterEntityByCid, seedClusterId, earliestShake)
      }
      // First-shake propagation: relaxation handles surrounding
      // soil's stability re-evaluation automatically each tick. The
      // pre-diffusion code stamped FLAG_SAG_RECHECK on the cluster's
      // perimeter here; that's now a no-op the relaxer covers.
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
    // Commit fall — clear the cluster's shake state (one entity write
    // replaces N per-cell Map.delete calls) and the FLAG_SHAKING bits
    // on every cell. shakeStartTick is reset to -1 below after the
    // physical translation so the cluster skips the telegraph on its
    // next descent step.
    for (const idx of cells) {
      flags[idx]! &= ~FLAG_SHAKING
    }
    setClusterShake(world, clusterEntityByCid, seedClusterId, 0)

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
    const drillerCell = driller?.get(Driller)
    let crushedDriller = false
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
          })
        )
        continue
      }
      // Otherwise translate stone + carry its hit count to new cell.
      // FLAG_FALLING marks the new cell as in-motion: next tick the
      // cluster bypasses the canFall reconsideration (rule: rocks
      // resolve fully once started). Cluster id moves with the cell
      // so the cluster preserves identity through the fall — and the
      // per-cluster -1 sentinel is set ONCE outside this loop
      // (replaces the per-cell Map.set the pre-H code did per move).
      const movingClusterId = clusterIdArr[idx] ?? 0
      if (drillerCell && drillerCell.col === c && drillerCell.row === r + 1) {
        crushedDriller = true
      }
      tiles[idx] = TILE_AIR
      flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
      clusterIdArr[idx] = 0
      tiles[newIdx] = TILE_STONE
      flags[newIdx] = (flags[newIdx] ?? 0) | FLAG_AUTOTILE_DIRTY | FLAG_FALLING
      clusterIdArr[newIdx] = movingClusterId
      hits[newIdx] = rockHits
      hits[idx] = 0
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
    if (crushedDriller) world.set(GameState, { runState: 'dying' })
    // Per-cluster -1 sentinel applies cluster-wide post-translation —
    // means "skip the visible telegraph next time, you already paid
    // your shake dues this fall". Cleared when the cluster lands and
    // its FLAG_FALLING bits get retracted (above, in the canFall=
    // false branch).
    setClusterShake(world, clusterEntityByCid, seedClusterId, -1)
    advancedAny = true
  }

  // DISTURBED is sticky and only clears when a cluster cell actually
  // moves (handled inline at the commit branch). The previous version
  // wiped DISTURBED on every "didn't fall this tick" pass, which made
  // shaking clusters lose their disturbed bit mid-telegraph — they'd
  // shake forever and never commit to falling.

  if (advancedAny) lastAvalancheTick = gs.tick

  // Reap RockCluster entities whose cluster id wasn't touched this
  // tick — those clusters have no remaining cells (vaporized, broke
  // off as Hazard debris, drilled away). Held-drag clusters are
  // already in `seenClusterIds`, so this leaves them alone.
  world.query(RockCluster).forEach((e) => {
    const rc = e.get(RockCluster)
    if (!rc) return
    if (!seenClusterIds.has(rc.clusterId)) e.destroy()
  })
}

/** Reset avalanche timer on world rotation / restart. */
export function resetAvalanche(world?: World): void {
  lastAvalancheTick = 0
  shakingDirtyIdxs.length = 0
  if (world) {
    world.query(RockCluster).forEach((e) => e.destroy())
  }
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
  extendTicks: number
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
  // Shake-start lives on the RockCluster entity, one
  // value per cluster id (not per cell). Look up the cluster's entity
  // and push its single shakeStartTick forward by extendTicks —
  // shifts the shake elapsed metric backward toward zero, buying the
  // player one fresh telegraph window. The -1 sentinel ("already
  // telegraphed") is guarded out: brace can't extend a cluster that
  // doesn't have a real shake to extend.
  const cid = grid.clusterId[seedIdx] ?? 0
  if (cid === 0) return false
  const entity = world.query(RockCluster).find((e) => {
    const rc = e.get(RockCluster)
    return rc?.clusterId === cid
  })
  if (!entity) return false
  const rc = entity.get(RockCluster)
  if (!rc) return false
  if (rc.shakeStartTick > 0) {
    entity.set(RockCluster, { shakeStartTick: rc.shakeStartTick + extendTicks })
  }
  return true
}

/** Reset module-level state on world rotation / restart. */
export function resetHazardSpawn(): void {
  lastSpawnTick = 0
  hazardSafeMinRow = -1
  lastSpawnByCol.fill(0)
}

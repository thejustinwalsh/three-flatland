import type { World } from 'koota'
import {
  Driller,
  FLAG_AUTOTILE_DIRTY,
  FLAG_DISTURBED,
  FLAG_FALLING,
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
  PLAYFIELD_TOP_OFFSET_ROWS,
  PLAY_COLS,
  TILE_PX,
} from '../constants'
import { biomeAt, isFreeFall } from '../biomes'
import { createRng } from '../lib/rng'
import { markCellAndNeighborsDirty } from './autotile-pass'

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

const MIN_FALL_CELLS = 3 // need at least this many AIR cells below the warning before spawning

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

  const interval = Math.max(
    HAZARD_SPAWN_INTERVAL_FLOOR,
    Math.floor(HAZARD_SPAWN_INTERVAL_TICKS / (1 + boost)),
  )
  if (gs.tick - lastSpawnTick < interval) return

  // Don't stack hazards: skip if any non-landed Hazard is within the spawn range.
  let nearbyExists = false
  world.query(Hazard).forEach((entity) => {
    if (nearbyExists) return
    const h = entity.get(Hazard)!
    if (h.phase === 'landed') return
    if (Math.abs(h.col - d.col) <= HAZARD_SPAWN_COL_RANGE) nearbyExists = true
  })
  if (nearbyExists) return

  // Find candidate columns near the driller with a visible AIR column
  // from the LOGICAL playfield top (a fixed N rows above the driller)
  // down at least MIN_FALL_CELLS. A taller viewport must NOT be a
  // hazard-dodging advantage, so we ignore cam.y here on purpose —
  // rocks spawn at the same logical position regardless of how far
  // back into history the renderer is showing.
  const topRow = Math.max(0, d.row - PLAYFIELD_TOP_OFFSET_ROWS)
  const { cols, rows, tiles } = grid
  const candidates: { col: number; warningRow: number }[] = []
  for (let dc = -HAZARD_SPAWN_COL_RANGE; dc <= HAZARD_SPAWN_COL_RANGE; dc++) {
    const col = Math.max(0, Math.min(PLAY_COLS - 1, d.col + dc))
    // Need topRow itself to be AIR (the rock spawns there visibly).
    if (tiles[topRow * cols + col] !== TILE_AIR) continue
    // Strict hole rule: the column must be CONTINUOUS AIR from playfield
    // top all the way down to at least `driller.row + MIN_FALL_CELLS`.
    // This guarantees the rock has somewhere to actually fall — right
    // after a void, the driller is at the new biome's surface and no
    // column has been drilled yet, so no rocks can spawn until the
    // driller has actively dug a hole.
    const needRow = Math.min(rows - 1, d.row + MIN_FALL_CELLS)
    let blocked = false
    for (let r = topRow + 1; r <= needRow; r++) {
      if (tiles[r * cols + col] !== TILE_AIR) {
        blocked = true
        break
      }
    }
    if (blocked) continue
    candidates.push({ col, warningRow: topRow })
  }
  if (candidates.length === 0) return

  const rng = createRng((gs.tick * 0x9e3779b1 + d.col) >>> 0)
  const pick = candidates[rng.intRange(0, candidates.length - 1)]!

  world.spawn(
    Hazard({
      col: pick.col,
      py: pick.warningRow * TILE_PX + TILE_PX / 2,
      vy: 0,
      phase: 'warning',
      fallAtTick: gs.tick + HAZARD_WARNING_TICKS,
    }),
  )
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
  const { cols, rows, tiles, flags } = grid

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
        if (tiles[restIdx] === TILE_AIR) {
          tiles[restIdx] = TILE_STONE
          flags[restIdx] = (flags[restIdx] ?? 0) | FLAG_AUTOTILE_DIRTY | FLAG_DISTURBED
          markCellAndNeighborsDirty(world, h.col, restRow)
          for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nc = h.col + dc
            const nr = restRow + dr
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
            const nIdx = nr * cols + nc
            if (tiles[nIdx] === TILE_STONE) {
              flags[nIdx] = (flags[nIdx] ?? 0) | FLAG_DISTURBED
            }
          }
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
const AVALANCHE_HITS_TO_BREAK = 4
const AVALANCHE_FALL_INTERVAL_TICKS = 12 // ~200ms at 60Hz
// Stones use the same SHAKE duration as soil sag so the player
// reads "this is about to fall" with the same cadence regardless
// of tile class. Soil's full 3-phase telegraph (PRECARIOUS=600ms +
// SAGGING=600ms + SHAKING=400ms) doesn't apply here — the rock
// avalanche skips PRECARIOUS/SAGGING (no anchor-based prediction
// for stones; disturbance is sudden) and uses just SHAKE → settle
// → commit. SHAKE duration matches SAG_SHAKING_TICKS=24 ticks.
const AVALANCHE_SHAKE_TICKS = 24  // ~400ms — matches soil SAG_SHAKING_TICKS
const AVALANCHE_SETTLE_TICKS = 6  // ~100ms steady pause before commit
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
  const { cols, rows, tiles, flags, hits } = grid

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
    const cells: number[] = []
    stack.length = 0
    stack.push(i)
    seen[i] = 1
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
        if (!seen[ni] && tiles[ni] === TILE_STONE) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
    }
    // Rock codex: a cluster currently in motion (FLAG_FALLING set on
    // any cell) bypasses the threshold and disturbance gates — once
    // started, it must resolve fully. This is what makes rocks
    // dangerous: they don't stop and reconsider mid-fall the way
    // soil sag does. Cluster shrinks (via break-offs) → still falls.
    // Cluster splits → each piece keeps falling rigidly.
    let inMotion = false
    for (const idx of cells) {
      if ((flags[idx]! & FLAG_FALLING) !== 0) {
        inMotion = true
        break
      }
    }

    if (!inMotion && cells.length < AVALANCHE_THRESHOLD) {
      // Cluster too small to INITIATE a fall — drop any stale shake
      // bookkeeping so a future grow-back-to-4 starts a fresh
      // telegraph. (A sub-4 inert cluster is allowed to float as
      // soil support, per rule 6.)
      for (const idx of cells) shakeStartTick.delete(idx)
      continue
    }

    // Stability rule: a cluster only INITIATES a fall if it has been
    // DISTURBED (a fresh rock landed on/near it, or another cluster
    // commit nearby). Untouched 4+ piles from world generation are
    // inert until the player or another rock disturbs them.
    if (!inMotion) {
      let disturbed = false
      for (const idx of cells) {
        if ((flags[idx]! & FLAG_DISTURBED) !== 0) {
          disturbed = true
          break
        }
      }
      if (!disturbed) continue
    }

    // The cluster can fall iff every cell directly under the cluster's
    // bottom edge (not part of the cluster) is AIR or SOIL — anything
    // else (fixture, rock, world-floor) blocks the whole pile.
    const inCluster = new Set(cells)
    let canFall = true
    const bottomEdge: number[] = []
    for (const idx of cells) {
      const c = idx % cols
      const r = (idx - c) / cols
      if (r + 1 >= rows) {
        canFall = false
        break
      }
      const belowIdx = (r + 1) * cols + c
      if (inCluster.has(belowIdx)) continue
      const below = tiles[belowIdx]
      if (below !== TILE_AIR && below !== TILE_SOIL) {
        canFall = false
        break
      }
      bottomEdge.push(idx)
    }
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
      void anyNew
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
      // cluster bypasses the threshold/disturbance gates and the
      // shake telegraph (rule: rocks resolve fully once started).
      // DISTURBED also travels so the cluster keeps falling. The -1
      // sentinel on shake-start means "already telegraphed" — extra
      // safety in case a non-inMotion path re-enters here.
      tiles[idx] = TILE_AIR
      flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
      tiles[newIdx] = TILE_STONE
      flags[newIdx] = (flags[newIdx] ?? 0) | FLAG_AUTOTILE_DIRTY | FLAG_DISTURBED | FLAG_FALLING
      hits[newIdx] = rockHits
      hits[idx] = 0
      shakeStartTick.set(newIdx, -1)
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

/** Reset module-level state on world rotation / restart. */
export function resetHazardSpawn(): void {
  lastSpawnTick = 0
  hazardSafeMinRow = -1
}

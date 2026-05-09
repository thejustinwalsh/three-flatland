import type { World } from 'koota'
import {
  CHUNK_ROWS,
  PLAY_COLS,
  STONE_MAX_HITS,
} from '../constants'
import {
  Explosive,
  FLAG_AUTOTILE_DIRTY,
  FLAG_SAG_RECHECK,
  Gem,
  Grid,
  Seed,
  TILE_AIR,
  TILE_EXPLOSIVE,
  TILE_FIXTURE_BASE,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import type { GemColor, GemSize } from '../atlas-regions'
import { biomeAt, isFreeFall, WORLD_BODY_ROWS, WORLD_LENGTH_ROWS, WORLD_VOID_ROWS } from '../biomes'
import { createRng, type Rng } from '../lib/rng'
import { clearChunkEntitiesInRowRange } from './collapse'

/**
 * Output of a per-chunk generation pass. The generator does not touch the
 * world directly; it returns a tile buffer + gem placements for the
 * `streamChunks` system to splice into the live grid.
 */
export interface GeneratedChunk {
  /** Cell array sized PLAY_COLS × CHUNK_ROWS, row-major. */
  tiles: Uint8Array
  gems: GeneratedGem[]
  /** Explosive placements (col, rowInChunk) — Explosive entities spawned at load. */
  explosives: { col: number; rowInChunk: number }[]
  /**
   * Phase 2 unification: stone indices that should spawn pre-damaged
   * (one drill from breaking). The previous TILE_ROCK speed-bump role
   * lives on as a `STONE_MAX_HITS - 1` initial hit count on these
   * cells; the copier in `loadChunk` consumes this list when stamping
   * `Grid.hits`.
   */
  damagedStones: number[]
}

export interface GeneratedGem {
  /** Column within the chunk (0..PLAY_COLS-1). */
  col: number
  /** Row within the chunk (0..CHUNK_ROWS-1). */
  rowInChunk: number
  color: GemColor
  size: GemSize
}

/** Smooth a chunk-local tile array using B5/S45 cellular automata rules. */
function smoothCA(chunk: Uint8Array, cols: number, rows: number): void {
  const next = new Uint8Array(chunk)
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (chunk[(y + dy) * cols + (x + dx)] !== TILE_AIR) n++
        }
      }
      const i = y * cols + x
      next[i] = n >= 5 ? TILE_SOIL : n <= 4 ? TILE_AIR : (chunk[i] ?? TILE_SOIL)
    }
  }
  chunk.set(next)
}

/**
 * Carve `count` cellular-automata caves into the given chunk-local buffer.
 *
 * Each cave is seeded as a 55%-air randomized region and smoothed for 4
 * iterations. The result is rounded organic-looking caverns.
 */
export function carveCaves(
  chunk: Uint8Array,
  cols: number,
  rows: number,
  count: number,
  rng: Rng,
): void {
  for (let i = 0; i < count; i++) {
    const cx = rng.intRange(2, cols - 3)
    const cy = rng.intRange(3, rows - 4)
    const w = rng.intRange(3, 6)
    const h = rng.intRange(2, 4)
    for (let y = cy - h; y <= cy + h; y++) {
      for (let x = cx - w; x <= cx + w; x++) {
        if (x <= 0 || y <= 0 || x >= cols - 1 || y >= rows - 1) continue
        if (rng.chance(0.55)) chunk[y * cols + x] = TILE_AIR
      }
    }
    for (let k = 0; k < 4; k++) smoothCA(chunk, cols, rows)
  }
}

/**
 * Carve `count` wide horizontal tunnels into the chunk. Each tunnel
 * is 1–2 rows tall and spans most of the chunk's width with random
 * length. These leave broad SOIL spans above/below that the
 * cantilever-sag rule can mark as unstable — the "introduce sag"
 * lever for early biomes.
 */
export function carveTunnels(
  chunk: Uint8Array,
  cols: number,
  rows: number,
  count: number,
  rng: Rng,
): void {
  for (let i = 0; i < count; i++) {
    const y = rng.intRange(3, rows - 4)
    const h = rng.intRange(1, 2)
    const startX = rng.intRange(0, 3)
    const endX = rng.intRange(cols - 4, cols - 1)
    for (let dy = 0; dy < h; dy++) {
      const r = y + dy
      if (r <= 0 || r >= rows - 1) continue
      for (let x = startX; x <= endX; x++) {
        if (x < 0 || x >= cols) continue
        chunk[r * cols + x] = TILE_AIR
      }
    }
  }
}

/**
 * Tetris-style stone shapes for cluster generation. Each shape is a
 * list of (col-offset, row-offset) cells relative to an anchor. The
 * shape pool mixes singles, dominoes, triominoes and tetrominoes so
 * worldgen produces visual variety AND a steady supply of disturbance-
 * eligible 4+ piles for the avalanche system.
 *
 * Frequencies (lower index = higher weight): smaller shapes appear
 * more often than the rarer 5+ tile blobs, keeping most encounters
 * quick obstacles while making the bigger piles feel earned.
 */
type StoneShape = readonly [number, number][]

const STONE_SHAPES: { weight: number; cells: StoneShape }[] = [
  // 1: single rock — still common but less dominant. Singles act as
  // anchors-in-mid-air after the Phase 2 cantilever rule, so they're
  // gameplay-meaningful, but the chunky shapes are what give the
  // world its visual mass and avalanche risk.
  { weight: 6, cells: [[0, 0]] },
  // 2: domino — horizontal + vertical
  { weight: 6, cells: [[0, 0], [1, 0]] },
  { weight: 6, cells: [[0, 0], [0, 1]] },
  // 3: triomino — line + L-tris (4 rotations)
  { weight: 5, cells: [[0, 0], [1, 0], [2, 0]] },
  { weight: 5, cells: [[0, 0], [0, 1], [0, 2]] },
  { weight: 5, cells: [[0, 0], [1, 0], [0, 1]] },
  { weight: 5, cells: [[0, 0], [1, 0], [1, 1]] },
  // 4: tetrominoes (Tetris pieces) — these reach the avalanche
  // threshold (4+ cells) and become live threats once disturbed.
  { weight: 5, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] }, // I horizontal
  { weight: 5, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] }, // I vertical
  { weight: 6, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] }, // O / square — solid 2x2
  { weight: 5, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] }, // T
  { weight: 5, cells: [[0, 0], [1, 0], [2, 0], [0, 1]] }, // L
  { weight: 5, cells: [[0, 0], [1, 0], [2, 0], [2, 1]] }, // J
  { weight: 4, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] }, // S
  { weight: 4, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }, // Z
  // 5: pentominoes — chunky and visually distinct. These look like
  // glom-rocks even without autotile rendering.
  { weight: 3, cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]] },     // P
  { weight: 3, cells: [[0, 0], [1, 0], [0, 1], [0, 2], [1, 2]] },     // U
  { weight: 3, cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },     // T-tall
  { weight: 3, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]] },     // bumped-line
  { weight: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },     // plus / cross
  { weight: 3, cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]] },     // pi
  // 6+: big piles — true avalanche fodder, mostly in deep biomes.
  { weight: 2, cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] }, // 3x2 block
  { weight: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]] }, // 2x3 block
  { weight: 2, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [2, 1]] }, // 4x2 staggered
]

const STONE_SHAPE_WEIGHT_TOTAL = STONE_SHAPES.reduce((s, sh) => s + sh.weight, 0)

function pickStoneShape(rng: Rng, biome: string): StoneShape {
  // Deeper biomes bias the pick toward larger shapes by skewing the
  // weighted roll into the tail of the table.
  const biasFactor = biome === 'stoneworks' || biome === 'crystal-caverns' || biome === 'core' ? 0.7 : 1
  let r = rng.chance(0.999) ? rng.intRange(0, STONE_SHAPE_WEIGHT_TOTAL - 1) * biasFactor : 0
  for (const shape of STONE_SHAPES) {
    if (r < shape.weight) return shape.cells
    r -= shape.weight
  }
  return STONE_SHAPES[0]!.cells
}

function placeStoneCluster(
  tiles: Uint8Array,
  cols: number,
  rows: number,
  rng: Rng,
  biome: string,
): void {
  const shape = pickStoneShape(rng, biome)
  // Bounding box of the shape, used to clamp the anchor placement.
  let maxC = 0
  let maxR = 0
  for (const [c, r] of shape) {
    if (c > maxC) maxC = c
    if (r > maxR) maxR = r
  }
  const ax = rng.intRange(1, Math.max(1, cols - maxC - 2))
  const ay = rng.intRange(2, Math.max(2, rows - maxR - 3))
  // Only stamp into SOIL — a shape that overlaps existing AIR / cave
  // would leave floating fragments, which the avalanche system can't
  // distinguish from intentional piles.
  for (const [c, r] of shape) {
    const idx = (ay + r) * cols + (ax + c)
    if (tiles[idx] === TILE_SOIL) tiles[idx] = TILE_STONE
  }
}

/**
 * Generate a chunk of tiles + gems for the (seed, chunkY) coordinate.
 *
 * Deterministic: the same inputs always produce the same output. Used
 * directly by tests and by `streamChunks` in the live game loop.
 */
export function generateChunk(seed: number, chunkY: number): GeneratedChunk {
  const cols = PLAY_COLS
  const rows = CHUNK_ROWS
  const tiles = new Uint8Array(cols * rows)
  const damagedStones: number[] = []

  const rng = createRng((Math.imul(seed, 0x9e3779b1) + chunkY) >>> 0)
  const depthMid = chunkY * rows + rows / 2
  const biome = biomeAt(depthMid)

  // Base fill: SOIL everywhere (chunk 0's top 4 rows become AIR for
  // sky). After the base fill we punch out any rows that fall inside
  // the void band of their world — those are the free-fall gaps
  // between layers.
  tiles.fill(TILE_SOIL)
  if (chunkY === 0) {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < cols; x++) {
        tiles[y * cols + x] = TILE_AIR
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    const absRow = chunkY * rows + r
    if (isFreeFall(absRow)) {
      for (let c = 0; c < cols; c++) {
        tiles[r * cols + c] = TILE_AIR
      }
    }
  }

  // Pre-cut caves
  const caves = rng.intRange(biome.caveCount[0], biome.caveCount[1])
  carveCaves(tiles, cols, rows, caves, rng)

  // Wide horizontal tunnels — fragment the soil mass into bands so
  // overhangs naturally form. The cantilever-sag rule picks up cells
  // too far from any anchor, so longer tunnels = more potential
  // "soil chunks that want to fall on the driller".
  const tunnels = rng.intRange(biome.tunnelCount[0], biome.tunnelCount[1])
  carveTunnels(tiles, cols, rows, tunnels, rng)

  // Stone clusters — tetris-like shapes embedded in soil. Most are
  // small (1–3 tiles, just an obstacle to drill around); occasional
  // 4+ piles become avalanche threats once disturbed by the player.
  const clusterBudget =
    biome.name === 'topsoil'
      ? rng.intRange(1, 2)
      : biome.name === 'stoneworks'
        ? rng.intRange(2, 5)
        : biome.name === 'crystal-caverns' || biome.name === 'core'
          ? rng.intRange(3, 6)
          : rng.intRange(1, 3)
  for (let i = 0; i < clusterBudget; i++) {
    placeStoneCluster(tiles, cols, rows, rng, biome.name)
  }

  // Multi-hit ROCK clusters — speed bumps that slow the driller.
  // Increase density with depth.
  const rockBudget =
    biome.name === 'topsoil'
      ? rng.intRange(0, 2)
      : biome.name === 'deep-dirt'
        ? rng.intRange(1, 3)
        : biome.name === 'stoneworks'
          ? rng.intRange(2, 5)
          : rng.intRange(1, 4)
  for (let i = 0; i < rockBudget; i++) {
    const x = rng.intRange(1, cols - 2)
    const y = rng.intRange(2, rows - 2)
    const idx = y * cols + x
    // Phase 2 unification: "rocks" are now stones, but speed-bump
    // stones spawn pre-damaged so the driller can drill through them
    // in a single hit (matches the previous TILE_ROCK feel). The
    // damage is stamped into Grid.hits below at the chunk-copy step.
    if (tiles[idx] === TILE_SOIL) {
      tiles[idx] = TILE_STONE
      damagedStones.push(idx)
    }
  }

  // EXPLOSIVE — sparse in stoneworks+, denser in core. Always inside soil.
  let explosiveBudget = 0
  if (biome.name === 'stoneworks') explosiveBudget = rng.intRange(0, 2)
  else if (biome.name === 'crystal-caverns') explosiveBudget = rng.intRange(1, 2)
  else if (biome.name === 'core') explosiveBudget = rng.intRange(1, 3)
  const explosivePlacements: { col: number; rowInChunk: number }[] = []
  for (let i = 0; i < explosiveBudget; i++) {
    const x = rng.intRange(1, cols - 2)
    const y = rng.intRange(3, rows - 3)
    const idx = y * cols + x
    if (tiles[idx] === TILE_SOIL) {
      tiles[idx] = TILE_EXPLOSIVE
      explosivePlacements.push({ col: x, rowInChunk: y })
    }
  }
  // Fixtures — placed as horizontal STRATA (bands), 1–3 rows thick
  // and 4–12 cells wide. Bands are obstacles that force homie into
  // lateral movement (can't drill straight through), and they anchor
  // the soil above them — drilling around the band creates lateral
  // cantilevers that produce more interesting falls.
  //
  // Placement rules:
  //   - Skip cells already occupied by STONE (rocks render on top of
  //     fixtures and the previous overlap looked muddy; user req).
  //   - Skip cells already in another fixture (no overlap between
  //     bands of different variants).
  //   - SOIL cells become fixtures; AIR cells stay AIR (so the band
  //     is a "stratum embedded in the dirt" not a floating slab).
  //   - Variant is consistent within a band — looks like a single
  //     rock layer / bone layer / mushroom shelf etc.
  const fixtureCount = rng.intRange(biome.fixtureCount[0], biome.fixtureCount[1])
  // Thickness weights: thin bands are most common; 3-row strata are rare.
  const pickThickness = (): number => {
    const r = rng.intRange(0, 9)
    if (r < 6) return 1
    if (r < 9) return 2
    return 3
  }
  for (let i = 0; i < fixtureCount; i++) {
    const allowed = biome.fixtureKinds.filter((k) => k !== 'stone-pillar')
    if (allowed.length === 0) continue
    const kind = allowed[rng.intRange(0, allowed.length - 1)]!
    const variant = kind === 'bone' ? 0 : kind === 'mushroom' ? 1 : 2

    const thickness = pickThickness()
    const width = rng.intRange(4, Math.min(12, cols - 2))
    const startCol = rng.intRange(1, Math.max(1, cols - 1 - width))
    // Avoid the very top/bottom rows of the chunk so bands don't
    // butt against the chunk seam (visually awkward when streaming).
    const startRow = rng.intRange(2, Math.max(2, rows - 1 - thickness))

    for (let r = startRow; r < startRow + thickness && r < rows; r++) {
      for (let c = startCol; c < startCol + width && c < cols; c++) {
        const idx = r * cols + c
        const t = tiles[idx]
        // Stone overlay rule: rocks have priority — never paint
        // fixture over stone. Also skip already-fixture cells so
        // bands don't recolor each other into a Frankenstein stripe.
        if (t === TILE_STONE) continue
        if (t !== undefined && t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 5) continue
        // Only paint where the chunk has SOIL — leaves caves clean.
        if (t === TILE_SOIL) {
          tiles[idx] = TILE_FIXTURE_BASE + variant
        }
      }
    }
  }

  // Gems — placed in SOIL or AIR; biome-weighted color + size. Gems
  // landing in a void band become free-fall obstacles: gem gravity
  // makes them drop, but the driller falls faster, so they appear to
  // scroll up past the player. If they leave the top of the camera
  // they fade and despawn (handled by gem-gravity).
  const gemCount = rng.intRange(biome.gemCount[0], biome.gemCount[1])
  const gems: GeneratedGem[] = []
  for (let i = 0; i < gemCount; i++) {
    const x = rng.intRange(1, cols - 2)
    const y = rng.intRange(1, rows - 2)
    const idx = y * cols + x
    if (tiles[idx] === TILE_SOIL || tiles[idx] === TILE_AIR) {
      const color = biome.gemPalette[rng.intRange(0, biome.gemPalette.length - 1)]!
      const sizeRoll = rng.next()
      const size: GemSize = sizeRoll < 0.5 ? 'small' : sizeRoll < 0.8 ? 'medium' : sizeRoll < 0.95 ? 'large' : 'huge'
      gems.push({ col: x, rowInChunk: y, color, size })
    }
  }

  // Void band reward: thicker at the TOP of the void (just below the
  // last solid biome row) and thinning out toward the bottom. The
  // driller scrolls past the dense top portion first; gems that
  // aren't caught fast scroll up through the playfield-top death
  // tween. By the bottom of the void there are very few gems left,
  // so very few land on the next biome's surface — most must be
  // grabbed during the scroll-by, making free fall a skill phase.
  //
  // Progressive jackpot: deeper worlds add +1 bonus to the top
  // density, capped so the screen never overflows.
  const voidColors: GemColor[] = ['emerald', 'topaz', 'ruby', 'amethyst']
  for (let r = 0; r < rows; r++) {
    const absRow = chunkY * rows + r
    if (!isFreeFall(absRow)) continue
    const worldIndex = Math.floor(absRow / WORLD_LENGTH_ROWS)
    const voidRow = ((absRow % WORLD_LENGTH_ROWS) - WORLD_BODY_ROWS)
    const t = voidRow / Math.max(1, WORLD_VOID_ROWS - 1) // 0 at top, 1 at bottom
    // Density falls quadratically from top to bottom of the void —
    // top rows ≈ 95% chance, middle ≈ 25%, bottom rows < 5%.
    const density = Math.max(0, (1 - t) * (1 - t))
    if (!rng.chance(density * 0.95)) continue
    const bonus = Math.min(1, Math.floor(worldIndex / 2))
    const attempts = 1 + (rng.chance(0.3) ? bonus : 0)
    for (let i = 0; i < attempts; i++) {
      const x = rng.intRange(0, cols - 1)
      const idx = r * cols + x
      if (tiles[idx] !== TILE_AIR) continue
      if (gems.some((g) => g.col === x && g.rowInChunk === r)) continue
      const color = voidColors[rng.intRange(0, voidColors.length - 1)]!
      const sizeRoll = rng.next()
      const size: GemSize = sizeRoll < 0.45 ? 'small' : sizeRoll < 0.75 ? 'medium' : sizeRoll < 0.92 ? 'large' : 'huge'
      gems.push({ col: x, rowInChunk: r, color, size })
    }
  }

  return { tiles, gems, explosives: explosivePlacements, damagedStones }
}

/* ------------------------------------------------------------------ */
/* Streaming                                                           */
/* ------------------------------------------------------------------ */

/**
 * Internal: which chunkY values are currently mounted in the grid window.
 * Per-world, but module-scoped because there's only ever one driller world.
 */
const loadedChunks = new Set<number>()

/** Reset streaming state — called on world rotation (hero-mode world-fall). */
export function resetStreaming(): void {
  loadedChunks.clear()
}

/**
 * Ensure the grid arrays cover at least `neededRows` rows. Grows by a
 * doubling strategy so amortized allocation cost is O(1) per row added.
 */
function ensureRows(world: World, neededRows: number): void {
  const grid = world.get(Grid)
  if (!grid) return
  if (grid.rows >= neededRows) return
  const newRows = Math.max(grid.rows * 2, neededRows, 256)
  const newSize = newRows * grid.cols
  const tiles = new Uint8Array(newSize)
  const flags = new Uint8Array(newSize)
  const frameIndex = new Uint8Array(newSize)
  const hits = new Uint8Array(newSize)
  tiles.set(grid.tiles)
  flags.set(grid.flags)
  frameIndex.set(grid.frameIndex)
  hits.set(grid.hits)
  world.set(Grid, { ...grid, tiles, flags, frameIndex, hits, rows: newRows })
}

/** Splice a generated chunk's tiles into the live grid at chunkY × CHUNK_ROWS. */
function loadChunk(world: World, chunkY: number, seed: number): void {
  if (loadedChunks.has(chunkY)) return
  const grid = world.get(Grid)
  if (!grid) return

  const baseRow = chunkY * CHUNK_ROWS
  ensureRows(world, baseRow + CHUNK_ROWS)

  const refreshed = world.get(Grid)!
  const { cols, tiles, flags, frameIndex, hits } = refreshed
  const generated = generateChunk(seed, chunkY)

  for (let r = 0; r < CHUNK_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const dst = (baseRow + r) * cols + c
      const t = generated.tiles[r * cols + c]!
      tiles[dst] = t
      // Stamp SAG_RECHECK on every fresh SOIL cell so the collapse
      // detector evaluates it on the next tick. Without this, a
      // worldgen-placed unanchored chunk stays dormant until a nearby
      // drill action propagates the flag to it via 4-neighbor
      // markCellAndNeighborsDirty — meaning chunks could "wake up
      // and fall" minutes after loading, when the player is nowhere
      // near. With SAG_RECHECK stamped at load, any cantilever-
      // unstable chunk falls IMMEDIATELY on first eval (or, if
      // outside the scan window, the first time the driller's
      // window reaches it).
      flags[dst] = t === TILE_SOIL
        ? FLAG_AUTOTILE_DIRTY | FLAG_SAG_RECHECK
        : FLAG_AUTOTILE_DIRTY
      frameIndex[dst] = 0
      // Phase 2 unification: hits = damage TAKEN. Fresh stones from
      // worldgen start at 0; speed-bump stones (the spiritual
      // successor of TILE_ROCK) get pre-damaged below.
      hits[dst] = 0
    }
  }
  // Apply pre-damage to speed-bump stones — one drill from breaking.
  for (const localIdx of generated.damagedStones) {
    const localR = Math.floor(localIdx / cols)
    const localC = localIdx % cols
    const dst = (baseRow + localR) * cols + localC
    hits[dst] = STONE_MAX_HITS - 1
  }

  // Track bottommost loaded row.
  if (baseRow + CHUNK_ROWS > refreshed.bottomRow) {
    world.set(Grid, { ...refreshed, bottomRow: baseRow + CHUNK_ROWS })
  }

  // Spawn gem entities.
  for (const g of generated.gems) {
    world.spawn(
      Gem({
        col: g.col,
        row: baseRow + g.rowInChunk,
        color: g.color,
        size: g.size,
        collected: false,
        scatteredUntilTick: 0,
      }),
    )
  }

  // Spawn explosive entities.
  for (const e of generated.explosives) {
    world.spawn(
      Explosive({
        col: e.col,
        row: baseRow + e.rowInChunk,
        triggered: false,
        fuseRemaining: 0,
      }),
    )
  }

  loadedChunks.add(chunkY)
}

/** Mark a chunk's cells as AIR and despawn its gems. */
function unloadChunk(world: World, chunkY: number): void {
  if (!loadedChunks.has(chunkY)) return
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, tiles, flags } = grid
  const baseRow = chunkY * CHUNK_ROWS

  // Despawn in-flight sag / fall entities pointing into this chunk
  // BEFORE we wipe the tiles. A SaggingChunk whose cells were in this
  // range would otherwise persist with stale row references — its
  // next tick would re-stamp SOIL via FallingChunk into a chunk that
  // should no longer exist.
  clearChunkEntitiesInRowRange(world, baseRow, baseRow + CHUNK_ROWS)

  for (let r = 0; r < CHUNK_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const dst = (baseRow + r) * cols + c
      if (dst < 0 || dst >= tiles.length) continue
      tiles[dst] = TILE_AIR
      flags[dst] = FLAG_AUTOTILE_DIRTY
    }
  }

  // Despawn gem entities in this chunk.
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)!
    if (g.row >= baseRow && g.row < baseRow + CHUNK_ROWS) {
      entity.destroy()
    }
  })

  // Despawn explosive entities in this chunk.
  world.query(Explosive).forEach((entity) => {
    const e = entity.get(Explosive)!
    if (e.row >= baseRow && e.row < baseRow + CHUNK_ROWS) {
      entity.destroy()
    }
  })

  loadedChunks.delete(chunkY)
}

/**
 * Maintain the loaded chunk window around the camera. Called each frame
 * by the Scene before rendering. Loads new chunks ahead of the camera,
 * unloads old ones behind it.
 */
export function streamChunks(world: World, cameraRow: number): void {
  const seedT = world.get(Seed)
  if (!seedT) return
  const seed = seedT.value

  const camChunkY = Math.floor(cameraRow / CHUNK_ROWS)
  const need = new Set<number>()
  for (let dy = -3; dy <= 5; dy++) {
    const cy = camChunkY + dy
    if (cy >= 0) need.add(cy)
  }

  for (const cy of need) {
    if (!loadedChunks.has(cy)) loadChunk(world, cy, seed)
  }
  for (const cy of [...loadedChunks]) {
    if (!need.has(cy)) unloadChunk(world, cy)
  }
}

import type { World } from 'koota'
import {
  CHUNK_ROWS,
  PLAY_COLS,
  ROCK_HITS,
} from '../constants'
import {
  Explosive,
  FLAG_AUTOTILE_DIRTY,
  Gem,
  Grid,
  Seed,
  TILE_AIR,
  TILE_EXPLOSIVE,
  TILE_FIXTURE_BASE,
  TILE_ROCK,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import type { GemColor, GemSize } from '../atlas-regions'
import { biomeAt } from '../biomes'
import { createRng, type Rng } from '../lib/rng'

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
 * Generate a chunk of tiles + gems for the (seed, chunkY) coordinate.
 *
 * Deterministic: the same inputs always produce the same output. Used
 * directly by tests and by `streamChunks` in the live game loop.
 */
export function generateChunk(seed: number, chunkY: number): GeneratedChunk {
  const cols = PLAY_COLS
  const rows = CHUNK_ROWS
  const tiles = new Uint8Array(cols * rows)

  const rng = createRng((Math.imul(seed, 0x9e3779b1) + chunkY) >>> 0)
  const depthMid = chunkY * rows + rows / 2
  const biome = biomeAt(depthMid)

  // Base fill: SOIL everywhere (chunk 0's top 4 rows become AIR for sky).
  tiles.fill(TILE_SOIL)
  if (chunkY === 0) {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < cols; x++) {
        tiles[y * cols + x] = TILE_AIR
      }
    }
  }

  // Pre-cut caves
  const caves = rng.intRange(biome.caveCount[0], biome.caveCount[1])
  carveCaves(tiles, cols, rows, caves, rng)

  // Stone scatter (no stone in topsoil; deeper biomes denser)
  if (biome.name !== 'topsoil') {
    const pillars = biome.name === 'stoneworks' ? rng.intRange(1, 3) : rng.intRange(0, 1)
    for (let i = 0; i < pillars; i++) {
      const x = rng.intRange(1, cols - 2)
      const y = rng.intRange(2, rows - 4)
      const h = rng.intRange(3, 6)
      for (let dy = 0; dy < h && y + dy < rows; dy++) {
        tiles[(y + dy) * cols + x] = TILE_STONE
      }
    }
  }

  // Multi-hit ROCK clusters — speed bumps that slow the driller.
  // Increase density with depth.
  if (biome.name !== 'topsoil') {
    const rockBudget =
      biome.name === 'deep-dirt'
        ? rng.intRange(1, 3)
        : biome.name === 'stoneworks'
          ? rng.intRange(2, 5)
          : rng.intRange(1, 4)
    for (let i = 0; i < rockBudget; i++) {
      const x = rng.intRange(1, cols - 2)
      const y = rng.intRange(2, rows - 2)
      const idx = y * cols + x
      if (tiles[idx] === TILE_SOIL) tiles[idx] = TILE_ROCK
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
  void TILE_STONE  // keep import alive

  // Fixtures — placed along cave roofs/floors as anchors + shelter
  const fixtureCount = rng.intRange(biome.fixtureCount[0], biome.fixtureCount[1])
  for (let i = 0; i < fixtureCount; i++) {
    const x = rng.intRange(1, cols - 2)
    const y = rng.intRange(1, rows - 2)
    if (tiles[y * cols + x] === TILE_AIR) {
      // Variant: 0=bone, 1=mushroom, 2=crystal — biome decides allowed kinds.
      const allowed = biome.fixtureKinds.filter((k) => k !== 'stone-pillar')
      if (allowed.length === 0) continue
      const kind = allowed[rng.intRange(0, allowed.length - 1)]!
      const variant = kind === 'bone' ? 0 : kind === 'mushroom' ? 1 : 2
      tiles[y * cols + x] = TILE_FIXTURE_BASE + variant
    }
  }

  // Gems — placed in SOIL or AIR; biome-weighted color + size
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

  return { tiles, gems, explosives: explosivePlacements }
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
      flags[dst] = FLAG_AUTOTILE_DIRTY
      frameIndex[dst] = 0
      // Initialize hit counter for ROCK tiles; non-rocks stay 0.
      hits[dst] = t === TILE_ROCK ? ROCK_HITS : 0
    }
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

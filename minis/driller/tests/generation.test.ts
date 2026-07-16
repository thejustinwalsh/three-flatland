import { describe, it, expect } from 'vitest'
import { generateChunk } from '../src/systems/generation'
import { CHUNK_ROWS, PLAY_COLS } from '../src/constants'
import { biomeAt, isFreeFall, WORLD_LENGTH_ROWS } from '../src/biomes'
import { isFixtureTile, TILE_AIR, TILE_SOIL } from '../src/traits'

/**
 * Per the new world model (single biome per layer separated by void
 * bands), the chunkY → biome mapping depends on `WORLD_LENGTH_ROWS`.
 * World 0 spans rows 0..119; chunkY 0..3 (rows 0..127) all sit in or
 * straddle world 0 → biome 0 (topsoil). Subsequent worlds rotate
 * through BIOMES.
 */
const ROWS_PER_WORLD_IN_CHUNKS = WORLD_LENGTH_ROWS / CHUNK_ROWS
const CHUNK_TOPSOIL = 0
const CHUNK_WORLD_2 = Math.ceil(2 * ROWS_PER_WORLD_IN_CHUNKS) // safely inside world 2

describe('generateChunk', () => {
  it('produces a chunk-sized array', () => {
    const c = generateChunk(42, 0)
    expect(c.tiles.length).toBe(PLAY_COLS * CHUNK_ROWS)
  })

  it('is deterministic for the same (seed, chunkY)', () => {
    const a = generateChunk(42, 3)
    const b = generateChunk(42, 3)
    expect(a.tiles).toEqual(b.tiles)
    expect(a.gems).toEqual(b.gems)
  })

  it('different seeds yield different chunks (deeper biome with caves)', () => {
    // Pick a chunk from world 2+ where caves and stone scatter introduce
    // RNG-driven divergence between seeds. World 2 corresponds to BIOMES[2]
    // (stoneworks) which has caves[2,3] + clusters + rocks.
    const a = generateChunk(42, CHUNK_WORLD_2)
    const b = generateChunk(43, CHUNK_WORLD_2)
    expect(a.tiles).not.toEqual(b.tiles)
  })

  it('chunkY=0 starts with the top 4 rows full of SOIL', () => {
    // Start-of-game guarantee: every run begins with 4 rows of solid
    // earth above the procedural mess. The driller spawns at (col=9,
    // row=0) inside this block; its own-cell-must-be-AIR safety
    // clears the spawn cell to AIR, leaving homie standing in a
    // single-cell hole punched into solid earth.
    const c = generateChunk(42, 0)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < PLAY_COLS; x++) {
        expect(c.tiles[y * PLAY_COLS + x]).toBe(TILE_SOIL)
      }
    }
  })

  it('a deeper-world chunk has at least one AIR cell from caves or void band', () => {
    const c = generateChunk(42, CHUNK_WORLD_2)
    let air = 0
    for (let i = 0; i < c.tiles.length; i++) if (c.tiles[i] === TILE_AIR) air++
    expect(air).toBeGreaterThan(0)
  })

  it('topsoil chunkY=0 stays mostly SOIL/AIR with light stone scatter', () => {
    // The first biome was previously absurdly empty; it now allows a
    // small budget of TILE_STONE clusters and pre-damaged speed-bump
    // stones (Phase 2 G unification rolled the old TILE_ROCK class into
    // TILE_STONE via Grid.hits). Floor the count so the assertion still
    // catches accidental flooding.
    const c = generateChunk(42, 0)
    let stones = 0
    let damaged = 0
    for (let i = 4 * PLAY_COLS; i < c.tiles.length; i++) {
      if (c.tiles[i] === 2 /* TILE_STONE */) stones++
    }
    for (const idx of c.damagedStones) {
      if (idx >= 4 * PLAY_COLS) damaged++
    }
    expect(stones).toBeLessThan(15)
    // Speed-bump stones are a SUBSET of all stones — the count must
    // not exceed total stones, and shouldn't dominate either.
    expect(damaged).toBeLessThanOrEqual(stones)
  })

  it('produces a gem-count range matching the chunk biome', () => {
    const top = generateChunk(42, CHUNK_TOPSOIL)
    const topBiome = biomeAt(CHUNK_TOPSOIL * CHUNK_ROWS + CHUNK_ROWS / 2)
    expect(top.gems.length).toBeGreaterThanOrEqual(topBiome.gemCount[0])
    expect(top.gems.length).toBeLessThanOrEqual(topBiome.gemCount[1])

    const deeper = generateChunk(42, CHUNK_WORLD_2)
    const deeperBiome = biomeAt(CHUNK_WORLD_2 * CHUNK_ROWS + CHUNK_ROWS / 2)
    expect(deeper.gems.length).toBeGreaterThanOrEqual(deeperBiome.gemCount[0])
    expect(deeper.gems.length).toBeLessThanOrEqual(deeperBiome.gemCount[1])
  })

  it('topsoil gems use the full 4-color palette', () => {
    const c = generateChunk(7, CHUNK_TOPSOIL)
    const allowed = new Set(['emerald', 'topaz', 'ruby', 'amethyst'])
    for (const g of c.gems) {
      expect(allowed).toContain(g.color)
    }
  })
})

/**
 * Fixture placement rules:
 *   - Each fixture is anchored LEFT (col 0), RIGHT (col cols-1), or
 *     CENTER (interior, with asymmetric gap).
 *   - Always ≥ 1 cell of clearance on at least one side (navigable
 *     corridor).
 *   - Sequence (top→bottom) honors alternation: no two LEFTs in a row,
 *     no two RIGHTs in a row, no more than two CENTERs in a row.
 */
describe('fixture placement pattern', () => {
  /**
   * Detect fixture bands. Generation enforces at least 1 row of
   * vertical clearance between bands, so a "band" is a maximal run
   * of consecutive rows containing fixture tiles, separated by
   * rows containing none. Band type is read from the TOP row of
   * the band (caves can punch through interior rows and shift the
   * min/max column inside the band).
   */
  function detectFixtures(c: ReturnType<typeof generateChunk>): {
    type: 'left' | 'right' | 'center'
    topRow: number
  }[] {
    const tiles = c.tiles
    const cols = PLAY_COLS
    const rows = CHUNK_ROWS
    const fixtures: { type: 'left' | 'right' | 'center'; topRow: number }[] = []
    let inBand = false
    for (let r = 0; r < rows; r++) {
      const fixCols: number[] = []
      for (let x = 0; x < cols; x++) {
        if (isFixtureTile(tiles[r * cols + x]!)) fixCols.push(x)
      }
      if (fixCols.length === 0) {
        inBand = false
        continue
      }
      if (inBand) continue
      // First row of a new band — classify by column extent.
      inBand = true
      const minC = Math.min(...fixCols)
      const maxC = Math.max(...fixCols)
      const touchesLeft = minC === 0
      const touchesRight = maxC === cols - 1
      const type: 'left' | 'right' | 'center' =
        touchesLeft && !touchesRight ? 'left' : touchesRight && !touchesLeft ? 'right' : 'center'
      fixtures.push({ type, topRow: r })
    }
    return fixtures
  }

  it('every fixture leaves ≥ 1 clear column on at least one side', () => {
    // Sample many seeds to exercise the placement variation.
    for (let seed = 1; seed <= 20; seed++) {
      const c = generateChunk(seed, CHUNK_WORLD_2)
      const cols = PLAY_COLS
      const rows = CHUNK_ROWS
      // For every row that has fixture tiles, check there's at least
      // one non-fixture column.
      for (let r = 0; r < rows; r++) {
        let fixCells = 0
        for (let x = 0; x < cols; x++) {
          if (isFixtureTile(c.tiles[r * cols + x]!)) fixCells++
        }
        if (fixCells > 0) {
          expect(
            fixCells,
            `seed=${seed} row=${r}: fixture fills entire row (no navigable corridor)`
          ).toBeLessThan(cols)
        }
      }
    }
  })

  it('placement sequence honors alternation rules across many seeds', () => {
    // Test the PLACEMENT DECISIONS directly via generateChunk's
    // fixturePlacements field. Cave generation can split or visually
    // disguise individual bands, so we don't rely on tile-level
    // detection here.
    for (let seed = 1; seed <= 50; seed++) {
      const c = generateChunk(seed, CHUNK_WORLD_2)
      let consecutiveLeft = 0
      let consecutiveRight = 0
      let consecutiveCenter = 0
      for (const p of c.fixturePlacements) {
        if (p === 'left') {
          consecutiveLeft++
          consecutiveRight = 0
          consecutiveCenter = 0
        } else if (p === 'right') {
          consecutiveRight++
          consecutiveLeft = 0
          consecutiveCenter = 0
        } else {
          consecutiveCenter++
          consecutiveLeft = 0
          consecutiveRight = 0
        }
        expect(consecutiveLeft, `seed=${seed} two lefts in a row`).toBeLessThanOrEqual(1)
        expect(consecutiveRight, `seed=${seed} two rights in a row`).toBeLessThanOrEqual(1)
        expect(consecutiveCenter, `seed=${seed} >2 centers in a row`).toBeLessThanOrEqual(2)
      }
    }
  })

  it('never produces a fixture-enclosed AIR pocket the driller could fall into and not escape', () => {
    // Trap: an AIR pocket sitting on a fixture, fully enclosed by
    // fixtures on both lateral sides (not world edges), with no
    // drillable floor anywhere across the pocket's width. The driller
    // falls in, can't drill any fixture, can't drill down (fixture
    // floor), and the AI doesn't climb out. Generation must carve a
    // SOIL escape through one of the walls. Tested across many seeds
    // and several biomes (different fixture density).
    const cols = PLAY_COLS
    const biomes = [CHUNK_TOPSOIL, CHUNK_WORLD_2, CHUNK_WORLD_2 + 5]
    for (let seed = 1; seed <= 30; seed++) {
      for (const chunkY of biomes) {
        const c = generateChunk(seed, chunkY)
        const rows = CHUNK_ROWS
        const handled = new Uint8Array(cols * rows)
        for (let r = 0; r < rows - 1; r++) {
          for (let cc = 0; cc < cols; cc++) {
            const idx = r * cols + cc
            if (handled[idx]) continue
            if (c.tiles[idx] !== TILE_AIR) continue
            const below = c.tiles[(r + 1) * cols + cc] ?? TILE_AIR
            if (!isFixtureTile(below)) continue
            // Walk the pocket.
            let lo = cc
            while (
              lo - 1 >= 0 &&
              c.tiles[r * cols + (lo - 1)] === TILE_AIR &&
              isFixtureTile(c.tiles[(r + 1) * cols + (lo - 1)] ?? TILE_AIR)
            )
              lo--
            let hi = cc
            while (
              hi + 1 < cols &&
              c.tiles[r * cols + (hi + 1)] === TILE_AIR &&
              isFixtureTile(c.tiles[(r + 1) * cols + (hi + 1)] ?? TILE_AIR)
            )
              hi++
            for (let pc = lo; pc <= hi; pc++) handled[r * cols + pc] = 1
            // Pocket has a floor exit anywhere?
            let hasFloorExit = false
            for (let pc = lo; pc <= hi; pc++) {
              const beneath = c.tiles[(r + 1) * cols + pc]
              if (beneath === undefined || !isFixtureTile(beneath)) {
                hasFloorExit = true
                break
              }
            }
            if (hasFloorExit) continue
            // Walls: edge counts as openable.
            const leftWallC = lo - 1
            const rightWallC = hi + 1
            const leftIsFixture =
              leftWallC >= 0 && isFixtureTile(c.tiles[r * cols + leftWallC] ?? TILE_AIR)
            const rightIsFixture =
              rightWallC < cols && isFixtureTile(c.tiles[r * cols + rightWallC] ?? TILE_AIR)
            const isTrap = leftIsFixture && rightIsFixture
            expect(
              isTrap,
              `seed=${seed} chunkY=${chunkY} trap pocket at row=${r} cols=${lo}-${hi}: AIR enclosed by fixtures with no drillable escape`
            ).toBe(false)
          }
        }
      }
    }
  })

  it('never generates a fixture in a void-band row', () => {
    // The void is reserved for free-fall and the inter-biome gem shower.
    // Fixtures, stones, and other structural features must stay inside
    // the biome body. We scan all rows across many seeds + chunkY
    // values that straddle the void boundary; any fixture tile in a
    // free-fall row is a regression.
    for (let seed = 1; seed <= 20; seed++) {
      // Pick chunks that cover both body and void rows of a biome cycle.
      // CHUNK_ROWS=32; WORLD_LENGTH_ROWS=205. chunkY values 3, 4, 5
      // around biome 0's void band (rows ~150-204).
      for (const chunkY of [3, 4, 5, 6, 7]) {
        const c = generateChunk(seed, chunkY)
        for (let r = 0; r < CHUNK_ROWS; r++) {
          const absRow = chunkY * CHUNK_ROWS + r
          if (!isFreeFall(absRow)) continue
          for (let col = 0; col < PLAY_COLS; col++) {
            const t = c.tiles[r * PLAY_COLS + col]
            expect(
              t === undefined || !isFixtureTile(t),
              `seed=${seed} chunkY=${chunkY} row=${r} (absRow=${absRow}) col=${col}: fixture in void`
            ).toBe(true)
          }
        }
      }
    }
  })

  it('produces variety: across many seeds we observe all three placement types', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const c = generateChunk(seed, CHUNK_WORLD_2)
      for (const p of c.fixturePlacements) seen.add(p)
      if (seen.size === 3) break
    }
    expect(seen).toContain('left')
    expect(seen).toContain('right')
    expect(seen).toContain('center')
  })
})

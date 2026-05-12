import { describe, it, expect } from 'vitest'
import { carveFixtureTrapEscapes } from '../src/systems/generation'
import { TILE_AIR, TILE_FIXTURE_BASE, TILE_SOIL, isFixtureTile } from '../src/traits'

/**
 * Direct unit tests for carveFixtureTrapEscapes.
 *
 * Generation can produce AIR pockets sitting on fixtures with no
 * lateral escape — the driller falls in, can't drill any fixture,
 * can't drill down (fixture floor), and the AI doesn't climb out.
 * The carve step finds these pockets and converts ONE side-wall
 * fixture cell to SOIL so the driller has a drillable escape.
 */

const F = TILE_FIXTURE_BASE
const A = TILE_AIR
const S = TILE_SOIL

function mkGrid(art: number[][]): { tiles: Uint8Array; cols: number; rows: number } {
  const rows = art.length
  const cols = art[0]!.length
  const tiles = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles[r * cols + c] = art[r]![c]!
    }
  }
  return { tiles, cols, rows }
}

describe('carveFixtureTrapEscapes', () => {
  it('carves an escape from a 1-cell trap (F-A-F over FFF)', () => {
    // Row 0: AIR pocket bounded by fixtures.
    // Row 1: fixture floor.
    // Trap: driller falls into col 1, surrounded by F on left/right/below.
    const { tiles, cols, rows } = mkGrid([
      [F, A, F],
      [F, F, F],
    ])
    carveFixtureTrapEscapes(tiles, cols, rows)
    // Carve target is the left wall (col 0) — but col 0 is the world
    // edge so the carve prefers the right wall (col 2).
    expect(tiles[0]).toBe(F) // left edge preserved
    expect(tiles[1]).toBe(A) // pocket cell unchanged
    expect(tiles[2]).toBe(S) // right wall carved to SOIL
  })

  it('carves the left wall when neither side is the edge', () => {
    // A pocket inside the grid (not touching either edge).
    const { tiles, cols, rows } = mkGrid([
      [S, F, A, F, S],
      [S, F, F, F, S],
    ])
    carveFixtureTrapEscapes(tiles, cols, rows)
    // Left wall (col 1) gets carved since neither wall is at edge=0.
    expect(tiles[1]).toBe(S) // left wall → SOIL
    expect(tiles[2]).toBe(A) // pocket preserved
    expect(tiles[3]).toBe(F) // right wall preserved
  })

  it('carves a multi-cell pocket (F-AAA-F over FFFFF)', () => {
    const { tiles, cols, rows } = mkGrid([
      [F, A, A, A, F],
      [F, F, F, F, F],
    ])
    carveFixtureTrapEscapes(tiles, cols, rows)
    // Col 0 is left wall AT edge → carve right wall (col 4).
    expect(tiles[0]).toBe(F)
    expect(tiles[1]).toBe(A)
    expect(tiles[2]).toBe(A)
    expect(tiles[3]).toBe(A)
    expect(tiles[4]).toBe(S)
  })

  it('does not carve when the pocket has a drillable floor exit', () => {
    // Pocket spans 3 cells; middle floor is SOIL (drillable). Driller
    // can drill down from col 2 → not a trap.
    const { tiles, cols, rows } = mkGrid([
      [F, A, A, A, F],
      [F, F, S, F, F],
    ])
    const before = tiles.slice()
    carveFixtureTrapEscapes(tiles, cols, rows)
    expect(tiles).toEqual(before) // no changes
  })

  it('does not carve when the pocket reaches the world edge', () => {
    // Open side: col 4 is AIR (not fixture). Pocket is bounded left
    // by fixture but RIGHT side is AIR — driller can walk right and
    // drop off the fixture span. Not a trap.
    const { tiles, cols, rows } = mkGrid([
      [F, A, A, A, A],
      [F, F, F, F, S],
    ])
    const before = tiles.slice()
    carveFixtureTrapEscapes(tiles, cols, rows)
    expect(tiles).toEqual(before)
  })

  it('does not carve when the pocket is open at world boundary (right edge)', () => {
    // The pocket extends to col cols-1 which is AIR at the world edge.
    // walkRight breaks when it hits the right edge — wall check on the
    // right is OUT-OF-BOUNDS (not a fixture), so we treat it as an
    // edge exit. No trap, no carve.
    const { tiles, cols, rows } = mkGrid([
      [F, A, A, A],
      [F, F, F, F],
    ])
    // pocket cells: col 1, 2, 3. col 3's r+1 = F (fixture floor).
    // walkRight from col 1 → check col 2 (AIR + F floor), col 3 (AIR
    // + F floor) → walk reaches hi=3. After loop, rightWallC = 4 which
    // is out of bounds (>= cols). leftWallC = 0 → fixture.
    // Per current code, rightIsFixture = (rightWallC < cols && ...).
    // With cols=4, rightWallC=4, that's false → not both walls fixture
    // → no carve. Good.
    const before = tiles.slice()
    carveFixtureTrapEscapes(tiles, cols, rows)
    expect(tiles).toEqual(before)
  })

  it('handles stacked traps independently', () => {
    // Two unrelated pockets in different rows.
    const { tiles, cols, rows } = mkGrid([
      [F, A, F, S, S],
      [F, F, F, S, S],
      [S, S, F, A, F],
      [S, S, F, F, F],
    ])
    carveFixtureTrapEscapes(tiles, cols, rows)
    // Top pocket: col 1, walls col 0 (edge) and col 2 → carve col 2.
    expect(tiles[2]).toBe(S)
    // Bottom pocket: col 3, walls col 2 and col 4 (edge) → carve col 2 (left).
    // Row 2 col 2: was F → now S.
    expect(tiles[2 * 5 + 2]).toBe(S)
    // Pocket AIR cells preserved.
    expect(tiles[1]).toBe(A)
    expect(tiles[2 * 5 + 3]).toBe(A)
  })

  it('the carved cell is drillable (SOIL is not a fixture)', () => {
    const { tiles, cols, rows } = mkGrid([
      [S, F, A, F, S],
      [S, F, F, F, S],
    ])
    carveFixtureTrapEscapes(tiles, cols, rows)
    // Whichever cell got carved must now NOT be a fixture.
    let carved = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tiles[r * cols + c]!
        // Walls that started as F should no longer ALL be F if there
        // was a trap. At least one became SOIL.
        if (t === S && (r === 0 && (c === 1 || c === 3))) carved++
      }
    }
    expect(carved).toBeGreaterThan(0)
    // Sanity: the carved SOIL is drillable.
    expect(isFixtureTile(S)).toBe(false)
  })
})

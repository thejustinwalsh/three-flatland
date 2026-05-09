import { describe, it, expect } from 'vitest'
import { detectChunks, seedAnchorsBFS, unstableCells } from '../src/lib/chunk-detect'
import { ANCHOR_DIST_INF, TILE_AIR, TILE_FIXTURE_BASE, TILE_SOIL, TILE_STONE } from '../src/traits'

const A = TILE_AIR
const D = TILE_SOIL
const S = TILE_STONE
const F = TILE_FIXTURE_BASE

describe('detectChunks', () => {
  it('finds one component for a contiguous SOIL block', () => {
    const cols = 4
    const rows = 3
    // prettier-ignore
    const tiles = new Uint8Array([
      D,D,D,D,
      D,D,D,D,
      A,A,A,A,
    ])
    const chunks = detectChunks(tiles, cols, rows)
    expect(chunks.length).toBe(1)
    expect(chunks[0]!.cells.length).toBe(8)
    expect(chunks[0]!.minRow).toBe(0)
    expect(chunks[0]!.maxRow).toBe(1)
  })

  it('separates two disconnected SOIL regions', () => {
    const cols = 4
    const rows = 3
    // prettier-ignore
    const tiles = new Uint8Array([
      D,A,A,D,
      D,A,A,D,
      D,A,A,D,
    ])
    expect(detectChunks(tiles, cols, rows).length).toBe(2)
  })

  it('does not include AIR or STONE in any chunk', () => {
    const cols = 3
    const rows = 3
    // prettier-ignore
    const tiles = new Uint8Array([
      D,A,D,
      A,S,A,
      D,A,D,
    ])
    const chunks = detectChunks(tiles, cols, rows)
    expect(chunks.length).toBe(4)
    for (const c of chunks) expect(c.cells.length).toBe(1)
  })

  it('treats diagonals as disconnected (4-connectivity)', () => {
    const cols = 3
    const rows = 3
    // Two SOIL cells touching only at a corner — should be separate.
    // prettier-ignore
    const tiles = new Uint8Array([
      D,A,A,
      A,A,A,
      A,A,D,
    ])
    expect(detectChunks(tiles, cols, rows).length).toBe(2)
  })
})

/**
 * Diffusion-aware anchor topology tests. Pin the new model:
 *   - Anchor seeds: row 0 conductors, cell-above-fixture
 *   - Conductors: SOIL + STONE both at +1 cost
 *   - Walls: AIR (not in graph), FIXTURE (no propagation)
 *   - Side walls: NOT anchors
 *   - Bottom-loaded edge: NOT a seed
 */
describe('seedAnchorsBFS — anchor topology', () => {
  function build(rows: string[]): { tiles: Uint8Array; dist: Uint8Array; cols: number; rows: number } {
    const cols = rows[0]!.length
    const r = rows.length
    const tiles = new Uint8Array(cols * r)
    for (let i = 0; i < r; i++) {
      for (let c = 0; c < cols; c++) {
        const ch = rows[i]![c]!
        let t: number = TILE_AIR
        if (ch === '#') t = TILE_SOIL
        else if (ch === 'S') t = TILE_STONE
        else if (ch === 'F') t = TILE_FIXTURE_BASE
        tiles[i * cols + c] = t
      }
    }
    const dist = new Uint8Array(cols * r).fill(255)
    seedAnchorsBFS(tiles, dist, cols, r)
    return { tiles, dist, cols, rows: r }
  }

  it('row 0 SOIL cells are seeds at distance 0', () => {
    const { dist, cols } = build([
      '######',
      '######',
      '######',
    ])
    for (let c = 0; c < cols; c++) expect(dist[c]).toBe(0)
  })

  it('distance grows by 1 per row downward through SOIL', () => {
    const { dist, cols } = build([
      '######',
      '######',
      '######',
      '######',
    ])
    expect(dist[0 * cols]).toBe(0)
    expect(dist[1 * cols]).toBe(1)
    expect(dist[2 * cols]).toBe(2)
    expect(dist[3 * cols]).toBe(3)
  })

  it('STONE conducts anchor distance at +1 cost (same as SOIL)', () => {
    const { dist, cols } = build([
      '######',
      'SSSSSS', // row 1: stone — should still get distance 1 from row 0 SOIL above
      '######',
    ])
    for (let c = 0; c < cols; c++) expect(dist[1 * cols + c]).toBe(1)
    for (let c = 0; c < cols; c++) expect(dist[2 * cols + c]).toBe(2)
  })

  it('FIXTURE seeds the cell directly above at distance 0; cells beside the fixture are NOT seeded', () => {
    // Fixture at (4, 2). Cell (3, 2) is above → seed. Sides not.
    const { dist, cols } = build([
      '......',
      '......',
      '......',
      '..#...',
      '..F...',
    ])
    expect(dist[3 * cols + 2]).toBe(0) // above fixture: seed
    // Side neighbors of the fixture itself: AIR or whatever, but not
    // seeded with 0 (they're AIR here).
  })

  it('FIXTURE is a wall — distance does not propagate through it', () => {
    // Fixture at (1, 2). SOIL on both sides at row 1. Anchor source
    // is row 0 SOIL above fixture's column too (it's also seeded at 0
    // since row 0 SOIL is a seed). The point: distance from (1,0) to
    // (1,4) routing THROUGH the fixture cell is forbidden — they
    // route through row 0 instead.
    const { dist, cols } = build([
      '#####',
      '#F###',
    ])
    // (1, 0) routes via row 0: distance 1.
    expect(dist[1 * cols + 0]).toBe(1)
    // (1, 2) routes via (0, 2) at distance 0 → 1. Same path-length.
    expect(dist[1 * cols + 2]).toBe(1)
  })

  it('side walls are NOT anchors — soil at col 0 has no special seed', () => {
    // SOIL at (5, 0) with no other anchor path: only routes via
    // upward. Distance = 5.
    const { dist, cols } = build([
      '#.....',
      '#.....',
      '#.....',
      '#.....',
      '#.....',
      '#.....',
    ])
    expect(dist[5 * cols + 0]).toBe(5)
  })

  it('bottom edge is NOT a seed — cells far from top edge get large distances', () => {
    // No fixtures, no anchors except row 0.
    const { dist, cols } = build([
      '.....',
      '.....',
      '.....',
      '.....',
      '#####',
    ])
    // Floating row of SOIL at row 4 with no path to row 0 → INF.
    for (let c = 0; c < cols; c++) {
      expect(dist[4 * cols + c]).toBe(ANCHOR_DIST_INF)
    }
  })
})

describe('unstableCells', () => {
  it('cells with distance > maxReach are unstable', () => {
    const cols = 4
    const rows = 6
    // prettier-ignore
    const tiles = new Uint8Array([
      D,D,D,D,
      D,D,D,D,
      D,D,D,D,
      D,D,D,D,
      D,D,D,D,
      D,D,D,D,
    ])
    const dist = new Uint8Array(tiles.length).fill(255)
    seedAnchorsBFS(tiles, dist, cols, rows)
    // With MAX_REACH=2, rows 3-5 are unstable.
    const unstable = unstableCells(tiles, dist, 2)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < cols; c++) {
        expect(unstable.has(r * cols + c)).toBe(false)
      }
    }
    for (let r = 3; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        expect(unstable.has(r * cols + c)).toBe(true)
      }
    }
  })
})

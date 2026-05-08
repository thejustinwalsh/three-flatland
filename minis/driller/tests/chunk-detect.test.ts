import { describe, it, expect } from 'vitest'
import { detectChunks, isSupported, type SoilChunk } from '../src/lib/chunk-detect'
import { TILE_AIR, TILE_FIXTURE_BASE, TILE_SOIL, TILE_STONE } from '../src/traits'

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

describe('isSupported', () => {
  it('a chunk touching the bottom edge is supported', () => {
    const cols = 3
    const rows = 3
    // prettier-ignore
    const tiles = new Uint8Array([
      A,A,A,
      A,D,A,
      A,D,A,
    ])
    const chunk: SoilChunk = detectChunks(tiles, cols, rows)[0]!
    expect(isSupported(chunk, tiles, cols, rows)).toBe(true)
  })

  it('a chunk touching the left edge is supported', () => {
    const cols = 3
    const rows = 3
    // prettier-ignore
    const tiles = new Uint8Array([
      D,A,A,
      D,A,A,
      A,A,A,
    ])
    const chunk: SoilChunk = detectChunks(tiles, cols, rows)[0]!
    expect(isSupported(chunk, tiles, cols, rows)).toBe(true)
  })

  it('a chunk touching the right edge is supported', () => {
    const cols = 3
    const rows = 3
    // prettier-ignore
    const tiles = new Uint8Array([
      A,A,D,
      A,A,D,
      A,A,A,
    ])
    const chunk: SoilChunk = detectChunks(tiles, cols, rows)[0]!
    expect(isSupported(chunk, tiles, cols, rows)).toBe(true)
  })

  it('a chunk adjacent to STONE is supported', () => {
    const cols = 3
    const rows = 3
    // prettier-ignore
    const tiles = new Uint8Array([
      A,D,A,
      A,S,A,
      A,A,A,
    ])
    const chunks = detectChunks(tiles, cols, rows)
    expect(chunks.length).toBe(1)
    expect(isSupported(chunks[0]!, tiles, cols, rows)).toBe(true)
  })

  it('a chunk adjacent to FIXTURE is supported', () => {
    const cols = 3
    const rows = 3
    // prettier-ignore
    const tiles = new Uint8Array([
      A,D,A,
      A,F,A,
      A,A,A,
    ])
    const chunks = detectChunks(tiles, cols, rows)
    expect(chunks.length).toBe(1)
    expect(isSupported(chunks[0]!, tiles, cols, rows)).toBe(true)
  })

  it('a fully-floating chunk is NOT supported', () => {
    const cols = 5
    const rows = 5
    // prettier-ignore
    const tiles = new Uint8Array([
      A,A,A,A,A,
      A,D,D,A,A,
      A,A,A,A,A,
      A,A,A,A,A,
      A,A,A,A,A,
    ])
    const chunks = detectChunks(tiles, cols, rows)
    expect(chunks.length).toBe(1)
    expect(isSupported(chunks[0]!, tiles, cols, rows)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { generateChunk } from '../src/systems/generation'
import { CHUNK_ROWS, PLAY_COLS } from '../src/constants'
import { TILE_AIR, TILE_SOIL } from '../src/traits'

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
    // chunkY=0 in topsoil has no caves/stone/fixtures, so tiles can match
    // across seeds (only gem positions differ). Test stoneworks instead.
    const a = generateChunk(42, 2)
    const b = generateChunk(43, 2)
    expect(a.tiles).not.toEqual(b.tiles)
  })

  it('chunkY=0 has AIR sky in the top 4 rows', () => {
    const c = generateChunk(42, 0)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < PLAY_COLS; x++) {
        expect(c.tiles[y * PLAY_COLS + x]).toBe(TILE_AIR)
      }
    }
  })

  it('chunkY=2 (≈64m, stoneworks) has at least one AIR cell from caves', () => {
    const c = generateChunk(42, 2)
    let air = 0
    for (let i = 0; i < c.tiles.length; i++) if (c.tiles[i] === TILE_AIR) air++
    expect(air).toBeGreaterThan(0)
  })

  it('topsoil (chunkY=0) has no stone scatter', () => {
    // Skip the AIR sky rows; in topsoil only SOIL & AIR should appear.
    const c = generateChunk(42, 0)
    for (let i = 4 * PLAY_COLS; i < c.tiles.length; i++) {
      expect([TILE_AIR, TILE_SOIL]).toContain(c.tiles[i])
    }
  })

  it('produces the spec gem-count range per biome', () => {
    // chunkY=0 → topsoil (1-2 gems)
    const top = generateChunk(42, 0)
    expect(top.gems.length).toBeGreaterThanOrEqual(1)
    expect(top.gems.length).toBeLessThanOrEqual(2)

    // chunkY=2 → stoneworks (4-6 gems)
    const stone = generateChunk(42, 2)
    expect(stone.gems.length).toBeGreaterThanOrEqual(4)
    expect(stone.gems.length).toBeLessThanOrEqual(6)
  })

  it('topsoil gems are emerald only', () => {
    const c = generateChunk(7, 0)
    for (const g of c.gems) {
      expect(g.color).toBe('emerald')
    }
  })
})

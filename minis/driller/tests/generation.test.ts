import { describe, it, expect } from 'vitest'
import { generateChunk } from '../src/systems/generation'
import { CHUNK_ROWS, PLAY_COLS } from '../src/constants'
import { biomeAt, WORLD_LENGTH_ROWS } from '../src/biomes'
import { TILE_AIR, TILE_SOIL } from '../src/traits'

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

  it('chunkY=0 has AIR sky in the top 4 rows', () => {
    const c = generateChunk(42, 0)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < PLAY_COLS; x++) {
        expect(c.tiles[y * PLAY_COLS + x]).toBe(TILE_AIR)
      }
    }
  })

  it('a deeper-world chunk has at least one AIR cell from caves or void band', () => {
    const c = generateChunk(42, CHUNK_WORLD_2)
    let air = 0
    for (let i = 0; i < c.tiles.length; i++) if (c.tiles[i] === TILE_AIR) air++
    expect(air).toBeGreaterThan(0)
  })

  it('topsoil chunkY=0 outside the void band has no stone scatter', () => {
    // World 0 (topsoil) only emits SOIL + AIR. Skip the sky rows.
    const c = generateChunk(42, 0)
    for (let i = 4 * PLAY_COLS; i < c.tiles.length; i++) {
      expect([TILE_AIR, TILE_SOIL]).toContain(c.tiles[i])
    }
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

  it('topsoil gems are emerald only', () => {
    const c = generateChunk(7, CHUNK_TOPSOIL)
    for (const g of c.gems) {
      expect(g.color).toBe('emerald')
    }
  })
})

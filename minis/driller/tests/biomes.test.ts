import { describe, it, expect } from 'vitest'
import {
  biomeAt,
  BIOMES,
  isFreeFall,
  rowInWorld,
  WORLD_BODY_ROWS,
  WORLD_LENGTH_ROWS,
} from '../src/biomes'

/**
 * The world is laid out as a sequence of single-biome layers separated
 * by free-fall void bands. Each layer is `WORLD_LENGTH_ROWS` rows long
 * and gets one of the BIOMES entries (cycling by world index). Biomes
 * NEVER change within a single world — only after the driller falls
 * through the void band into the next layer.
 */
describe('biomeAt', () => {
  it('returns the same biome for every row in one world', () => {
    const first = biomeAt(0)
    for (let r = 0; r < WORLD_LENGTH_ROWS; r++) {
      expect(biomeAt(r).name).toBe(first.name)
    }
  })

  it('cycles through BIOMES in declared order across worlds', () => {
    for (let w = 0; w < BIOMES.length * 2; w++) {
      const expected = BIOMES[w % BIOMES.length]!
      const sampleRow = w * WORLD_LENGTH_ROWS + 5
      expect(biomeAt(sampleRow).name).toBe(expected.name)
    }
  })

  it('non-negative inputs give a stable biome at row 0', () => {
    expect(biomeAt(0).name).toBe(BIOMES[0]!.name)
  })
})

describe('rowInWorld + isFreeFall', () => {
  it('rowInWorld is 0 at the top of every world', () => {
    expect(rowInWorld(0)).toBe(0)
    expect(rowInWorld(WORLD_LENGTH_ROWS)).toBe(0)
    expect(rowInWorld(WORLD_LENGTH_ROWS * 5)).toBe(0)
  })

  it('isFreeFall flips on at the bottom void band of each world', () => {
    expect(isFreeFall(0)).toBe(false)
    expect(isFreeFall(WORLD_BODY_ROWS - 1)).toBe(false)
    expect(isFreeFall(WORLD_BODY_ROWS)).toBe(true)
    expect(isFreeFall(WORLD_LENGTH_ROWS - 1)).toBe(true)
    expect(isFreeFall(WORLD_LENGTH_ROWS)).toBe(false) // body of next world
  })
})

describe('BIOMES table', () => {
  it('lists 5 biomes', () => {
    expect(BIOMES.length).toBe(5)
  })

  it('has the 4-color gem palette only (no sapphire)', () => {
    for (const b of BIOMES) {
      for (const c of b.gemPalette) {
        expect(['emerald', 'topaz', 'ruby', 'amethyst']).toContain(c)
      }
    }
  })

  it('every biome has a tile-render palette and bg gradient', () => {
    for (const b of BIOMES) {
      expect(b.palette.grass.length).toBe(3)
      expect(b.palette.edge.length).toBe(3)
      expect(b.palette.deep.length).toBe(3)
      expect(b.palette.stone.length).toBe(3)
      expect(b.bgGradient.length).toBe(2)
    }
  })
})

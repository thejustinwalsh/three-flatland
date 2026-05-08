import { describe, it, expect } from 'vitest'
import { biomeAt, BIOMES } from '../src/biomes'

describe('biomeAt', () => {
  it.each<[number, string]>([
    [0, 'topsoil'],
    [10, 'topsoil'],
    [19, 'topsoil'],
    [20, 'deep-dirt'],
    [49, 'deep-dirt'],
    [50, 'stoneworks'],
    [99, 'stoneworks'],
    [100, 'crystal-caverns'],
    [199, 'crystal-caverns'],
    [200, 'core'],
    [9999, 'core'],
  ])('depth %i → %s', (depth, name) => {
    expect(biomeAt(depth).name).toBe(name)
  })
})

describe('BIOMES table', () => {
  it('lists 5 biomes', () => {
    expect(BIOMES.length).toBe(5)
  })

  it('has non-overlapping bands (each min === previous max)', () => {
    for (let i = 1; i < BIOMES.length; i++) {
      expect(BIOMES[i]!.minDepth).toBe(BIOMES[i - 1]!.maxDepth)
    }
  })

  it('has the 4-color gem palette only (no sapphire)', () => {
    for (const b of BIOMES) {
      for (const c of b.gemPalette) {
        expect(['emerald', 'topaz', 'ruby', 'amethyst']).toContain(c)
      }
    }
  })
})

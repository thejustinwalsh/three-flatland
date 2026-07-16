import { describe, it, expect } from 'vitest'
import { autotileMask, maskToAtlasIndex, isGrassCap, NEIGHBOR_BITS } from '../src/lib/autotile'

describe('autotileMask', () => {
  it('returns NSEW (full) when all 4 neighbors are SOIL', () => {
    const isSoil = () => true
    expect(autotileMask(2, 2, isSoil)).toBe(
      NEIGHBOR_BITS.N | NEIGHBOR_BITS.S | NEIGHBOR_BITS.E | NEIGHBOR_BITS.W
    )
  })

  it('returns 0 (isolated) when no neighbors are SOIL', () => {
    const isSoil = () => false
    expect(autotileMask(2, 2, () => false)).toBe(0)
    void isSoil
  })

  it('returns N-only when only the cell above is SOIL', () => {
    const isSoil = (c: number, r: number) => c === 2 && r === 1
    expect(autotileMask(2, 2, isSoil)).toBe(NEIGHBOR_BITS.N)
  })

  it('returns SEW (grass-cap eligible) when N is air and others SOIL', () => {
    const isSoil = (c: number, r: number) => !(c === 2 && r === 1)
    const m = autotileMask(2, 2, isSoil)
    expect(m & NEIGHBOR_BITS.N).toBe(0)
    expect(m & NEIGHBOR_BITS.S).toBeTruthy()
    expect(m & NEIGHBOR_BITS.E).toBeTruthy()
    expect(m & NEIGHBOR_BITS.W).toBeTruthy()
  })
})

describe('maskToAtlasIndex', () => {
  it('returns the mask itself bounded to 4 bits', () => {
    expect(maskToAtlasIndex(0)).toBe(0)
    expect(maskToAtlasIndex(15)).toBe(15)
    expect(maskToAtlasIndex(0b11111)).toBe(0b1111)
  })
})

describe('isGrassCap', () => {
  it('is true when N is exposed and row is at the surface', () => {
    expect(isGrassCap(NEIGHBOR_BITS.S, 0, 0)).toBe(true)
  })

  it('is false when N is covered (something above us)', () => {
    expect(isGrassCap(NEIGHBOR_BITS.N | NEIGHBOR_BITS.S, 0, 0)).toBe(false)
  })

  it('is false when row is far below the surface even if N is exposed', () => {
    expect(isGrassCap(NEIGHBOR_BITS.S, 50, 0)).toBe(false)
  })

  it('still grass at row=2 (within +2 of surface row 0)', () => {
    expect(isGrassCap(NEIGHBOR_BITS.S, 2, 0)).toBe(true)
  })

  it('not grass at row=3 (just outside the +2 window)', () => {
    expect(isGrassCap(NEIGHBOR_BITS.S, 3, 0)).toBe(false)
  })
})

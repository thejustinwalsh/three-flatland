import { describe, it, expect } from 'vitest'
import {
  AUTOTILE_FRAME_COUNT,
  AUTOTILE_FRAME_SPECS,
  CORNER_BITS,
  NEIGHBOR_BITS,
  autotileFrameIndex,
  autotileIndex,
  autotileMask,
  eligibleCornerMask,
  isGrassCap,
  maskToAtlasIndex,
} from '../src/lib/autotile'

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
  it('returns the corner-free frame for a cardinal mask', () => {
    expect(maskToAtlasIndex(0)).toBe(0)
    expect(maskToAtlasIndex(15)).toBe(31)
    expect(maskToAtlasIndex(0b11111)).toBe(maskToAtlasIndex(15))
  })
})

describe('47-frame corner-aware atlas', () => {
  it('enumerates every valid cardinal/corner combination exactly once', () => {
    expect(AUTOTILE_FRAME_COUNT).toBe(47)
    expect(
      new Set(AUTOTILE_FRAME_SPECS.map((spec) => `${spec.cardinalMask}:${spec.missingCornerMask}`))
        .size
    ).toBe(47)

    for (const spec of AUTOTILE_FRAME_SPECS) {
      expect(spec.missingCornerMask & ~eligibleCornerMask(spec.cardinalMask)).toBe(0)
      expect(autotileFrameIndex(spec.cardinalMask, spec.missingCornerMask)).toBe(
        AUTOTILE_FRAME_SPECS.indexOf(spec)
      )
    }
  })

  it('distinguishes an inside L from the same cardinals with its diagonal filled', () => {
    const cells = new Set(['2:2', '2:1', '1:2'])
    const isMatch = (col: number, row: number) => cells.has(`${col}:${row}`)
    const missingDiagonal = autotileIndex(2, 2, isMatch)

    cells.add('1:1')
    const filledDiagonal = autotileIndex(2, 2, isMatch)

    expect(missingDiagonal).toBe(
      autotileFrameIndex(NEIGHBOR_BITS.N | NEIGHBOR_BITS.W, CORNER_BITS.NW)
    )
    expect(filledDiagonal).toBe(autotileFrameIndex(NEIGHBOR_BITS.N | NEIGHBOR_BITS.W, 0))
    expect(missingDiagonal).not.toBe(filledDiagonal)
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

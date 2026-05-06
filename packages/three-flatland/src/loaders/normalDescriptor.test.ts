import { describe, it, expect } from 'vitest'
import {
  framesToRegions,
  wholeTextureRegion,
  tileToRegions,
  tilesetToRegions,
} from './normalDescriptor'

describe('framesToRegions', () => {
  it('emits one region per frame with the same rect', () => {
    const regions = framesToRegions([
      { x: 0, y: 0, w: 16, h: 16 },
      { x: 16, y: 0, w: 16, h: 16 },
    ])
    expect(regions).toHaveLength(2)
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 16 })
    expect(regions[1]).toMatchObject({ x: 16, y: 0, w: 16, h: 16 })
  })
})

describe('wholeTextureRegion', () => {
  it('emits a single region covering the texture', () => {
    const regions = wholeTextureRegion(64, 32)
    expect(regions).toEqual([{ x: 0, y: 0, w: 64, h: 32 }])
  })
})

describe('tileToRegions', () => {
  const cell = { x: 0, y: 0, w: 16, h: 16 }

  it('emits a single flat region for untagged tiles', () => {
    const regions = tileToRegions(cell, undefined)
    expect(regions).toEqual([{ x: 0, y: 0, w: 16, h: 16 }])
  })

  it('emits a single flat region for explicit flat direction', () => {
    const regions = tileToRegions(cell, { tileDir: 'flat' })
    expect(regions).toEqual([{ x: 0, y: 0, w: 16, h: 16 }])
  })

  it('forwards tileBump / tileStrength / tileElevation on flat tiles', () => {
    const regions = tileToRegions(cell, {
      tileElevation: 0.25,
      tileBump: 'luminance',
      tileStrength: 1.5,
    })
    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      x: 0,
      y: 0,
      w: 16,
      h: 16,
      elevation: 0.25,
      bump: 'luminance',
      strength: 1.5,
    })
    // No direction / pitch on a flat region — those only make sense
    // on a tilted face.
    expect(regions[0]).not.toHaveProperty('direction')
    expect(regions[0]).not.toHaveProperty('pitch')
  })

  it('flat-tile bump forwards even without explicit tileDir', () => {
    const regions = tileToRegions(cell, { tileBump: 'red', tileStrength: 0.5 })
    expect(regions[0]).toMatchObject({ bump: 'red', strength: 0.5 })
  })

  it('accepts tileDirection as an alias of tileDir', () => {
    const a = tileToRegions(cell, { tileDir: 'south', tileCap: 4 })
    const b = tileToRegions(cell, { tileDirection: 'south', tileCap: 4 })
    expect(a).toEqual(b)
  })

  it('splits into cap + face for simple top-walls with tileCap shorthand', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCap: 4,
    })
    expect(regions).toHaveLength(2)
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 4 }) // cap
    expect(regions[1]).toMatchObject({
      x: 0,
      y: 4,
      w: 16,
      h: 12,
      direction: 'south',
    })
  })

  it('tileCapTop is equivalent to tileCap shorthand', () => {
    const a = tileToRegions(cell, { tileDir: 'south', tileCap: 4 })
    const b = tileToRegions(cell, { tileDir: 'south', tileCapTop: 4 })
    expect(a).toEqual(b)
  })

  it('per-edge fields override the shorthand entirely', () => {
    // Shorthand is ignored when ANY per-edge field is present.
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCap: 99, // must be ignored
      tileCapTop: 4,
    })
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 4 })
  })

  it('accepts legacy *Px alias names', () => {
    const canonical = tileToRegions(cell, {
      tileDir: 'south',
      tileCap: 4,
    })
    const legacy = tileToRegions(cell, {
      tileDirection: 'south',
      tileCapPx: 4,
    })
    expect(canonical).toEqual(legacy)
  })

  it('canonical fields win over legacy aliases when both present', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCapTop: 4,
      tileCapTopPx: 99, // loses
    })
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 4 })
  })

  it('emits L-shaped cap for a top-left outer corner', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south-east',
      tileCapTop: 4,
      tileCapLeft: 4,
    })
    // 1: top strip (16x4), 2: left strip below top (4x12), 3: face (12x12)
    expect(regions).toHaveLength(3)
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 4 })
    expect(regions[1]).toMatchObject({ x: 0, y: 4, w: 4, h: 12 })
    expect(regions[2]).toMatchObject({
      x: 4,
      y: 4,
      w: 12,
      h: 12,
      direction: 'south-east',
    })
  })

  it('emits L-shaped cap for a top-right outer corner', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south-west',
      tileCapTop: 4,
      tileCapRight: 4,
    })
    expect(regions).toHaveLength(3)
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 4 })      // top
    expect(regions[1]).toMatchObject({ x: 12, y: 4, w: 4, h: 12 })     // right
    expect(regions[2]).toMatchObject({
      x: 0,
      y: 4,
      w: 12,
      h: 12,
      direction: 'south-west',
    })
  })

  it('emits left+right side-cap for corridor pieces', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'up',
      tileCapLeft: 3,
      tileCapRight: 3,
    })
    expect(regions).toHaveLength(3)
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 3, h: 16 })       // left cap
    expect(regions[1]).toMatchObject({ x: 13, y: 0, w: 3, h: 16 })      // right cap
    expect(regions[2]).toMatchObject({
      x: 3,
      y: 0,
      w: 10,
      h: 16,
      direction: 'up',
    })
  })

  it('emits all four cap strips when every edge is set', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCapTop: 2,
      tileCapBottom: 2,
      tileCapLeft: 2,
      tileCapRight: 2,
    })
    // top, bottom, left-mid, right-mid, face
    expect(regions).toHaveLength(5)
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 2 })
    expect(regions[1]).toMatchObject({ x: 0, y: 14, w: 16, h: 2 })
    expect(regions[2]).toMatchObject({ x: 0, y: 2, w: 2, h: 12 })
    expect(regions[3]).toMatchObject({ x: 14, y: 2, w: 2, h: 12 })
    expect(regions[4]).toMatchObject({
      x: 2,
      y: 2,
      w: 12,
      h: 12,
      direction: 'south',
    })
  })

  it('clamps out-of-range cap values to the cell extent', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCapTop: 999,
    })
    // Cap clamps to full height → face region drops out.
    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 16 })
  })

  it('ignores zero and negative caps', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCapTop: 0,
      tileCapBottom: -5,
    })
    // No caps — single face-only region.
    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      x: 0,
      y: 0,
      w: 16,
      h: 16,
      direction: 'south',
    })
  })

  it('propagates per-tile pitch / bump / strength overrides to the face region', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCapTop: 4,
      tilePitch: 0.3,
      tileBump: 'none',
      tileStrength: 2,
    })
    const face = regions[1]!
    expect(face.pitch).toBe(0.3)
    expect(face.bump).toBe('none')
    expect(face.strength).toBe(2)
  })

  it('respects the cell origin when synthesizing absolute-atlas coords', () => {
    const regions = tileToRegions(
      { x: 32, y: 48, w: 16, h: 16 },
      { tileDir: 'south', tileCapTop: 4 }
    )
    expect(regions[0]).toMatchObject({ x: 32, y: 48, w: 16, h: 4 })
    expect(regions[1]).toMatchObject({ x: 32, y: 52, w: 16, h: 12 })
  })
})

describe('tileToRegions — corner caps', () => {
  const cell = { x: 0, y: 0, w: 16, h: 16 }

  it('single top-left corner cap produces a 4×4 cap + L-shaped face', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCapTopLeft: 4,
    })
    // Expected: 1 cap square + face regions that cover the rest (an L-shape
    // decomposed into rects). The specific decomposition can be multiple
    // rects — assert on total covered area instead of exact rect shapes.
    const cap = regions.find((r) => !r.direction)!
    expect(cap).toMatchObject({ x: 0, y: 0, w: 4, h: 4 })
    const faceArea = regions
      .filter((r) => r.direction === 'south')
      .reduce((sum, r) => sum + r.w * r.h, 0)
    expect(faceArea).toBe(16 * 16 - 4 * 4) // 256 − 16 = 240
  })

  it('all four corner caps leave an octagonal face decomposed to rects', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'north',
      tileCapTopLeft: 4,
      tileCapTopRight: 4,
      tileCapBottomLeft: 4,
      tileCapBottomRight: 4,
    })
    const caps = regions.filter((r) => !r.direction)
    expect(caps).toHaveLength(4)
    const faceArea = regions
      .filter((r) => r.direction === 'north')
      .reduce((sum, r) => sum + r.w * r.h, 0)
    expect(faceArea).toBe(16 * 16 - 4 * 4 * 4) // 256 − 64 = 192
  })

  it('corner cap + top-edge cap overlap is harmless', () => {
    // Top-left corner fully inside the top strip — effectively redundant,
    // but should produce valid regions with no area double-counted.
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCapTop: 4,
      tileCapTopLeft: 4,
    })
    const faceArea = regions
      .filter((r) => r.direction === 'south')
      .reduce((sum, r) => sum + r.w * r.h, 0)
    const capUnionArea = 16 * 4 // just the top strip — corner is inside it
    expect(faceArea).toBe(16 * 16 - capUnionArea) // 256 − 64 = 192
  })

  it('clamps oversized corner caps to the cell extent', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'north',
      tileCapTopLeft: 999,
    })
    // Cap clamps to the smaller cell dimension (16) → the whole cell is cap.
    // Face area should be zero, and the defensive "cover the cell" path
    // kicks in only when `regions.length === 0` — here we have the clamp-cap
    // rect plus no face, so the cell is fully covered by the cap.
    const cap = regions.find((r) => !r.direction)!
    expect(cap).toMatchObject({ x: 0, y: 0, w: 16, h: 16 })
    expect(regions.filter((r) => r.direction).length).toBe(0)
  })

  it('BR corner cap on a cell with non-zero origin computes absolute coords', () => {
    const regions = tileToRegions(
      { x: 32, y: 48, w: 16, h: 16 },
      { tileDir: 'north-west', tileCapBottomRight: 4 }
    )
    const cap = regions.find((r) => !r.direction)!
    expect(cap).toMatchObject({ x: 44, y: 60, w: 4, h: 4 })
  })
})

describe('tileToRegions — elevation', () => {
  const cell = { x: 0, y: 0, w: 16, h: 16 }

  it('caps get elevation 1 (top-of-wall)', () => {
    const regions = tileToRegions(cell, { tileDir: 'south', tileCapTop: 4 })
    const cap = regions.find((r) => !r.direction)!
    expect(cap.elevation).toBe(1)
  })

  it('face regions get the default face elevation (0.5) when no tileElevation', () => {
    const regions = tileToRegions(cell, { tileDir: 'south', tileCapTop: 4 })
    const face = regions.find((r) => r.direction === 'south')!
    expect(face.elevation).toBe(0.5)
  })

  it('tileElevation overrides the face elevation', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south',
      tileCapTop: 4,
      tileElevation: 0.8,
    })
    const face = regions.find((r) => r.direction === 'south')!
    expect(face.elevation).toBe(0.8)
  })

  it('corner-cap tiles have elevation 1 on every cap region', () => {
    const regions = tileToRegions(cell, {
      tileDir: 'south-east',
      tileCapTopLeft: 4,
    })
    const caps = regions.filter((r) => !r.direction)
    for (const cap of caps) {
      expect(cap.elevation).toBe(1)
    }
  })

  it('untagged (flat) tiles have no elevation field — baker uses descriptor/default 0', () => {
    const regions = tileToRegions(cell, undefined)
    expect(regions).toHaveLength(1)
    expect(regions[0]!.elevation).toBeUndefined()
  })

  it('all-cap tile: tileElevation on a flat tile applies to the whole cell', () => {
    // Wall piece seen dead-on from above / roof patch / pillar cap.
    const regions = tileToRegions(cell, { tileElevation: 1 })
    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      x: 0,
      y: 0,
      w: 16,
      h: 16,
      elevation: 1,
    })
    // No direction — stays flat-normal (reconstructed nz = 1 at runtime).
    expect(regions[0]!.direction).toBeUndefined()
  })

  it('explicit tileDir:"flat" with tileElevation also produces a whole-cell region', () => {
    const regions = tileToRegions(cell, { tileDir: 'flat', tileElevation: 0.8 })
    expect(regions).toHaveLength(1)
    expect(regions[0]!.elevation).toBe(0.8)
  })
})

describe('tilesetToRegions', () => {
  it('concatenates per-cell regions across a tileset', () => {
    const regions = tilesetToRegions([
      { x: 0, y: 0, w: 16, h: 16, meta: { tileDir: 'south', tileCap: 4 } },
      { x: 16, y: 0, w: 16, h: 16 }, // untagged → single flat region
    ])
    expect(regions).toHaveLength(3)
    // Tagged cell: cap + face
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 4 })
    expect(regions[1]).toMatchObject({ direction: 'south' })
    // Untagged cell: full-cell flat
    expect(regions[2]).toMatchObject({ x: 16, y: 0, w: 16, h: 16 })
  })
})

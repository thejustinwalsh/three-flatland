import { describe, expect, it } from 'vitest'
import { gridFromCellSize, cellKey, type GridSpec } from '@three-flatland/preview/grid'
import {
  childrenFromSplit,
  splitRegionByGrid,
  splitRegionRowsCols,
  tilesFromGrid,
  tilesFromPicked,
  type TileRect,
} from './gridOps'
import type { EditableRegion } from './regionOps'

/** Every tile pair disjoint + total area preserved = an exact partition. */
function expectPartition(tiles: TileRect[], of: TileRect): void {
  const area = tiles.reduce((sum, t) => sum + t.w * t.h, 0)
  expect(area).toBe(of.w * of.h)
  for (let i = 0; i < tiles.length; i++) {
    const a = tiles[i]!
    expect(a.x).toBeGreaterThanOrEqual(of.x)
    expect(a.y).toBeGreaterThanOrEqual(of.y)
    expect(a.x + a.w).toBeLessThanOrEqual(of.x + of.w)
    expect(a.y + a.h).toBeLessThanOrEqual(of.y + of.h)
    for (let j = i + 1; j < tiles.length; j++) {
      const b = tiles[j]!
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      expect(overlap, `tiles ${i} and ${j} overlap`).toBe(false)
    }
  }
}

describe('tilesFromGrid', () => {
  it('yields one row-major rect per cell for a uniform tile grid', () => {
    const grid = gridFromCellSize(160, 160, 16, 16)
    const tiles = tilesFromGrid(grid)
    expect(tiles).toHaveLength(100)
    expect(tiles[0]).toEqual({ x: 0, y: 0, w: 16, h: 16 })
    expect(tiles[1]).toEqual({ x: 16, y: 0, w: 16, h: 16 }) // row-major: col advances first
    expect(tiles[10]).toEqual({ x: 0, y: 16, w: 16, h: 16 })
    expect(tiles[99]).toEqual({ x: 144, y: 144, w: 16, h: 16 })
  })

  it('respects an offset grid and hand-dragged (non-uniform) edges', () => {
    const grid: GridSpec = { colEdges: [4, 10, 20], rowEdges: [0, 8] }
    expect(tilesFromGrid(grid)).toEqual([
      { x: 4, y: 0, w: 6, h: 8 },
      { x: 10, y: 0, w: 10, h: 8 },
    ])
  })

  it('drops zero-area cells produced by image-bounds clamping', () => {
    // 20px image, 16px tiles: gridFromCellSize computes 1 col; force the
    // degenerate case with hand-built edges where clamping collapsed one.
    const grid: GridSpec = { colEdges: [0, 16, 16], rowEdges: [0, 16] }
    expect(tilesFromGrid(grid)).toEqual([{ x: 0, y: 0, w: 16, h: 16 }])
  })
})

describe('tilesFromPicked', () => {
  const grid = gridFromCellSize(64, 64, 16, 16) // 4×4

  it('returns picked cells in row-major order regardless of pick order', () => {
    const picked = new Set([cellKey(2, 1), cellKey(0, 3), cellKey(2, 0)])
    expect(tilesFromPicked(grid, picked)).toEqual([
      { x: 48, y: 0, w: 16, h: 16 },
      { x: 0, y: 32, w: 16, h: 16 },
      { x: 16, y: 32, w: 16, h: 16 },
    ])
  })

  it('ignores stale keys outside the current grid range', () => {
    const picked = new Set([cellKey(0, 0), cellKey(9, 9), 'garbage'])
    expect(tilesFromPicked(grid, picked)).toEqual([{ x: 0, y: 0, w: 16, h: 16 }])
  })
})

describe('splitRegionByGrid', () => {
  const grid = gridFromCellSize(160, 160, 16, 16)

  it('splits a grid-aligned region into exact tiles', () => {
    const region = { x: 16, y: 16, w: 32, h: 32 }
    const tiles = splitRegionByGrid(region, grid)
    expect(tiles).toHaveLength(4)
    expectPartition(tiles, region)
    expect(tiles.every((t) => t.w === 16 && t.h === 16)).toBe(true)
  })

  it('keeps remainder slivers where the region bounds sit between grid lines', () => {
    // x spans 12..44: cut at 16 and 32 → widths 4, 16, 12. y spans 4..20:
    // cut at 16 → heights 12, 4. Edge remainders survive as real children.
    const region = { x: 12, y: 4, w: 32, h: 16 }
    const tiles = splitRegionByGrid(region, grid)
    expect(tiles).toHaveLength(6)
    expectPartition(tiles, region)
    expect(tiles[0]).toEqual({ x: 12, y: 4, w: 4, h: 12 })
    expect(tiles[5]).toEqual({ x: 32, y: 16, w: 12, h: 4 })
  })

  it('returns a single parent-equal child when no grid line crosses the region', () => {
    const region = { x: 17, y: 17, w: 8, h: 8 } // fully inside the (16..32)² cell
    expect(splitRegionByGrid(region, grid)).toEqual([region])
  })
})

describe('splitRegionRowsCols', () => {
  it('splits evenly when divisible', () => {
    const region = { x: 16, y: 4, w: 16, h: 12 }
    const tiles = splitRegionRowsCols(region, 2, 2)
    expect(tiles).toEqual([
      { x: 16, y: 4, w: 8, h: 6 },
      { x: 24, y: 4, w: 8, h: 6 },
      { x: 16, y: 10, w: 8, h: 6 },
      { x: 24, y: 10, w: 8, h: 6 },
    ])
    expectPartition(tiles, region)
  })

  it('distributes a non-divisible remainder across children instead of dumping it on one edge', () => {
    const region = { x: 0, y: 0, w: 10, h: 3 }
    const tiles = splitRegionRowsCols(region, 1, 3)
    expect(tiles.map((t) => t.w)).toEqual([3, 4, 3])
    expectPartition(tiles, region)
  })

  it('clamps counts to ≥1 and drops degenerate children when cuts exceed pixels', () => {
    expect(splitRegionRowsCols({ x: 0, y: 0, w: 8, h: 8 }, 0, -3)).toEqual([{ x: 0, y: 0, w: 8, h: 8 }])
    // 2px wide, 4 columns: only 2 non-degenerate children can exist.
    const slivers = splitRegionRowsCols({ x: 0, y: 0, w: 2, h: 2 }, 1, 4)
    expectPartition(slivers, { x: 0, y: 0, w: 2, h: 2 })
    expect(slivers.every((t) => t.w > 0 && t.h > 0)).toBe(true)
  })
})

describe('childrenFromSplit', () => {
  const tiles: TileRect[] = [
    { x: 0, y: 0, w: 8, h: 6 },
    { x: 8, y: 0, w: 8, h: 6 },
  ]
  let n = 0
  const makeId = () => `id-${n++}`

  it('children inherit exactly the parent’s EXPLICIT fields — inherited-from-descriptor fields stay omitted', () => {
    const parent: EditableRegion = {
      id: 'parent',
      x: 0,
      y: 0,
      w: 16,
      h: 6,
      direction: 'south',
      elevation: 0.5,
      // no bump/pitch/strength — parent inherits those from the descriptor
    }
    const children = childrenFromSplit(parent, tiles, makeId)
    expect(children).toHaveLength(2)
    for (const child of children) {
      expect(child.direction).toBe('south')
      expect(child.elevation).toBe(0.5)
      expect('bump' in child).toBe(false)
      expect('pitch' in child).toBe(false)
      expect('strength' in child).toBe(false)
    }
    expect(children[0]).toMatchObject(tiles[0]!)
    expect(children[1]).toMatchObject(tiles[1]!)
  })

  it('gives every child a fresh id, never the parent’s', () => {
    const parent: EditableRegion = { id: 'parent', x: 0, y: 0, w: 16, h: 6 }
    const children = childrenFromSplit(parent, tiles, makeId)
    const ids = new Set(children.map((c) => c.id))
    expect(ids.size).toBe(children.length)
    expect(ids.has('parent')).toBe(false)
  })

  it('a parent with no explicit fields yields bare-bounds children', () => {
    const parent: EditableRegion = { id: 'parent', x: 0, y: 0, w: 16, h: 6 }
    const [child] = childrenFromSplit(parent, tiles, makeId)
    expect(Object.keys(child!).sort()).toEqual(['h', 'id', 'w', 'x', 'y'])
  })
})

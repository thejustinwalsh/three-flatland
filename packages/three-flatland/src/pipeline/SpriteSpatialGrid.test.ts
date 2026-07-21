import { describe, it, expect } from 'vitest'
import { SpriteSpatialGrid } from './SpriteSpatialGrid'
import type { Sprite2D } from '../sprites/Sprite2D'

// The grid keys on Sprite2D identity only; a bare tagged object suffices.
function sprite(tag: string): Sprite2D {
  return { tag } as unknown as Sprite2D
}
function ids(it: Iterable<Sprite2D>): string[] {
  return [...it].map((s) => (s as unknown as { tag: string }).tag).sort()
}

describe('SpriteSpatialGrid', () => {
  it('tracks the world-Z span (grows, does not shrink on remove)', () => {
    const g = new SpriteSpatialGrid(128)
    expect(g.zMin).toBe(Infinity)
    expect(g.zMax).toBe(-Infinity)
    const a = sprite('a')
    g.insert(a, 0, 0, 10, 10, 5)
    g.insert(sprite('b'), 0, 0, 10, 10, -3)
    expect(g.zMin).toBe(-3)
    expect(g.zMax).toBe(5)
    g.remove(a) // span stays wide — a safe over-approximation
    expect(g.zMin).toBe(-3)
    expect(g.zMax).toBe(5)
    g.clear()
    expect(g.zMin).toBe(Infinity)
    expect(g.zMax).toBe(-Infinity)
  })

  it('querySegment collapses to a single cell when both ends share it', () => {
    const g = new SpriteSpatialGrid(128)
    g.insert(sprite('a'), 10, 10, 4, 4)
    g.insert(sprite('b'), 300, 10, 4, 4)
    // Both endpoints in cell (0,0).
    expect(ids(g.querySegment(5, 5, 20, 20))).toEqual(['a'])
  })

  it('querySegment unions every cell the block spans', () => {
    const g = new SpriteSpatialGrid(128)
    g.insert(sprite('a'), 10, 10, 4, 4) // cell 0,0
    g.insert(sprite('b'), 260, 10, 4, 4) // cell 2,0
    // Segment from cell 0,0 to cell 2,0 covers both.
    expect(ids(g.querySegment(10, 10, 260, 10))).toEqual(['a', 'b'])
  })

  it('does not hang on a grazing ray: an astronomically long segment stays bounded', () => {
    const g = new SpriteSpatialGrid(128)
    g.insert(sprite('a'), 10, 10, 4, 4) // cell 0,0, inside the huge block
    g.insert(sprite('b'), 1e6, 1e6, 4, 4) // far away, also inside the block
    // A segment spanning ~1e10 cells per axis — the naive block loop would
    // iterate ~1e20 cells. The occupied-set branch returns the two real
    // sprites in O(occupied) instead.
    const start = performance.now()
    const hit = ids(g.querySegment(0, 0, 1e12, 1e12))
    expect(performance.now() - start).toBeLessThan(200)
    expect(hit).toEqual(['a', 'b'])
  })

  it('terminates on a SMALL block at astronomically large cell indices', () => {
    const g = new SpriteSpatialGrid(128)
    g.insert(sprite('a'), 10, 10, 4, 4)
    // A tiny 2-cell block, but at world coords ~2^53·cellSize where integer
    // ++ would stop advancing. Must fall back to the occupied-cell branch and
    // return promptly rather than spinning forever.
    const huge = 2 ** 53 * 128
    const start = performance.now()
    const hit = ids(g.querySegment(huge, huge, huge + 128, huge))
    expect(performance.now() - start).toBeLessThan(200)
    // Query is far from 'a' — no false hit, and critically it RETURNED.
    expect(hit).toEqual([])
  })
})

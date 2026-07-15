import { describe, it, expect } from 'vitest'
import { packRects, type PackInput } from './maxrects'

describe('packRects', () => {
  const rect = (id: string, w: number, h: number) => ({ id, w, h })

  it('packs a single rect at origin with padding offset', () => {
    const input: PackInput = {
      rects: [rect('a', 10, 10)],
      maxSize: 64,
      padding: 2,
      powerOfTwo: false,
    }
    const result = packRects(input)
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(result.placements.get('a')).toEqual({ x: 2, y: 2, w: 10, h: 10 })
    // 2 (left pad) + 10 + 2 (right pad) = 14, rounded up to multiple of 4 = 16
    expect(result.size).toEqual({ w: 16, h: 16 })
  })

  it('returns nofit when largest rect exceeds maxSize', () => {
    const result = packRects({
      rects: [rect('big', 100, 100)],
      maxSize: 64,
      padding: 0,
      powerOfTwo: false,
    })
    expect(result.kind).toBe('nofit')
  })

  it('rounds output up to power of two when requested', () => {
    const result = packRects({
      rects: [rect('a', 10, 10)],
      maxSize: 64,
      padding: 0,
      powerOfTwo: true,
    })
    if (result.kind !== 'ok') throw new Error('expected ok')
    // 10x10 → next power of two ≥ 10 is 16
    expect(result.size).toEqual({ w: 16, h: 16 })
  })

  it('places non-overlapping rects with padding gutters', () => {
    const result = packRects({
      rects: [rect('a', 10, 10), rect('b', 10, 10)],
      maxSize: 64,
      padding: 2,
      powerOfTwo: false,
    })
    if (result.kind !== 'ok') throw new Error('expected ok')
    const a = result.placements.get('a')!
    const b = result.placements.get('b')!
    // Centers must be ≥ 10 + padding apart on at least one axis
    const dx = Math.abs(a.x - b.x)
    const dy = Math.abs(a.y - b.y)
    expect(dx >= 10 + 2 || dy >= 10 + 2).toBe(true)
  })
})

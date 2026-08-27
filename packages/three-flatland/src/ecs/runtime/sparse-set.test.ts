import { describe, expect, it } from 'vitest'
import { SparseSet } from './sparse-set'

describe('SparseSet', () => {
  it('returns the removed dense position while preserving swapped membership', () => {
    const set = new SparseSet()
    set.add(4)
    set.add(7)
    set.add(9)

    expect(set.delete(7)).toBe(1)
    expect(set.dense).toEqual([4, 9])
    expect(set.has(7)).toBe(false)
    expect(set.has(9)).toBe(true)
    expect(set.delete(7)).toBe(-1)
    expect(set.delete(4)).toBe(0)
    expect(set.dense).toEqual([9])
  })
})

import { describe, it, expect } from 'vitest'
import { computeRunKey } from './batchUtils'

describe('computeRunKey', () => {
  it('gives every component a full 32 bits (no truncation collisions)', () => {
    expect(computeRunKey(0, 0, 1)).not.toBe(computeRunKey(0, 0x10000, 1))
    expect(computeRunKey(0, 65536, 1)).not.toBe(computeRunKey(0, 0, 1))
    expect(computeRunKey(0x10000, 0, 1)).not.toBe(computeRunKey(0, 0, 1))
  })

  it('lexicographic order equals sortLayer-major numeric order, including negatives', () => {
    const keys = [
      computeRunKey(-2, 5, 1),
      computeRunKey(-1, 0, 1),
      computeRunKey(0, 9, 1),
      computeRunKey(1, 0, 1),
      computeRunKey(250, 0, 1),
    ]
    const sorted = [...keys].sort()
    expect(sorted).toEqual(keys)
  })
})

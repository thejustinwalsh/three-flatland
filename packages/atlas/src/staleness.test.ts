import { describe, it, expect } from 'vitest'
import { computeStalenessHash, hashBytes } from './staleness'

describe('hashBytes', () => {
  it('is deterministic for identical bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    expect(hashBytes(bytes)).toBe(hashBytes(new Uint8Array([1, 2, 3, 4])))
  })

  it('differs when bytes differ', () => {
    expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 4])))
  })
})

describe('computeStalenessHash', () => {
  const sources = [
    { name: 'a', contentHash: 'hash-a' },
    { name: 'b', contentHash: 'hash-b' },
  ]

  it('is deterministic for the same sources and options', () => {
    expect(computeStalenessHash(sources, { vertexBudget: 8 })).toBe(
      computeStalenessHash(sources, { vertexBudget: 8 })
    )
  })

  it('is order-independent over the sources array', () => {
    const reversed = [...sources].reverse()
    expect(computeStalenessHash(sources, {})).toBe(computeStalenessHash(reversed, {}))
  })

  it('changes when a source content hash changes', () => {
    const changed = [{ name: 'a', contentHash: 'hash-a-modified' }, sources[1]!]
    expect(computeStalenessHash(sources, {})).not.toBe(computeStalenessHash(changed, {}))
  })

  it('changes when a source is added or removed', () => {
    const withExtra = [...sources, { name: 'c', contentHash: 'hash-c' }]
    expect(computeStalenessHash(sources, {})).not.toBe(computeStalenessHash(withExtra, {}))
  })

  it('changes when bake options change', () => {
    expect(computeStalenessHash(sources, { vertexBudget: 8 })).not.toBe(
      computeStalenessHash(sources, { vertexBudget: 12 })
    )
  })

  it('is unaffected by key order in bake options', () => {
    expect(computeStalenessHash(sources, { vertexBudget: 8, alphaThreshold: 4 })).toBe(
      computeStalenessHash(sources, { alphaThreshold: 4, vertexBudget: 8 })
    )
  })
})

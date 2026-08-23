import { describe, expect, it } from 'vitest'
import {
  ENTITY_INDEX_BITS,
  ENTITY_INDEX_MASK,
  ENTITY_INDEX_STRIDE,
  EntityPool,
  MAX_ENTITY_GENERATION,
  entityGeneration,
  entityIndex,
  packEntity,
} from './entity'

describe('private entity allocator', () => {
  it('retains the production 20-bit index capacity and safe packed range', () => {
    expect(ENTITY_INDEX_BITS).toBe(20)
    expect(ENTITY_INDEX_STRIDE).toBe(1_048_576)
    expect(ENTITY_INDEX_MASK).toBe(1_048_575)
    expect(() => packEntity(0, 0)).toThrow(/generation/)

    const last = packEntity(ENTITY_INDEX_MASK, MAX_ENTITY_GENERATION)
    expect(Number.isSafeInteger(last)).toBe(true)
    expect(entityIndex(last)).toBe(ENTITY_INDEX_MASK)
    expect(entityGeneration(last)).toBe(MAX_ENTITY_GENERATION)
    expect(() => packEntity(0, MAX_ENTITY_GENERATION + 1)).toThrow(/safe handle range/)
  })

  it('fails tiny-pool capacity atomically and reuses one freed index', () => {
    const pool = new EntityPool({ maxIndex: 3, maxGeneration: 4 })
    const entities = [pool.allocate(), pool.allocate(), pool.allocate(), pool.allocate()]

    expect(entities.map(entityIndex)).toEqual([0, 1, 2, 3])
    expect(entities[0]).toBe(ENTITY_INDEX_STRIDE)
    expect(pool.isAlive(0 as never)).toBe(false)
    expect(() => pool.allocate()).toThrow(/index capacity/)
    expect(entities.every((entity) => pool.isAlive(entity))).toBe(true)

    const stale = entities[1]!
    pool.destroy(stale)
    const recycled = pool.allocate()
    expect(entityIndex(recycled)).toBe(1)
    expect(entityGeneration(recycled)).toBeGreaterThan(entityGeneration(stale))
    expect(pool.isAlive(stale)).toBe(false)
    expect(pool.isAlive(recycled)).toBe(true)
    expect(() => pool.allocate()).toThrow(/index capacity/)
    pool.dispose()
  })

  it('retires an index at the configured generation ceiling without aliasing', () => {
    const pool = new EntityPool({ maxIndex: 0, maxGeneration: 3 })
    const original = pool.allocate()
    pool.destroy(original)
    const final = pool.allocate()

    expect(entityIndex(final)).toBe(0)
    expect(final).not.toBe(original)
    expect(pool.isAlive(original)).toBe(false)
    expect(() => pool.destroy(final)).not.toThrow()
    expect(pool.isAlive(final)).toBe(false)
    expect(() => pool.allocate()).toThrow(/index capacity/)
    pool.dispose()
  })

  it('rejects invalid test limits', () => {
    expect(() => new EntityPool({ maxIndex: -1 })).toThrow(/maxIndex/)
    expect(() => new EntityPool({ maxIndex: ENTITY_INDEX_MASK + 1 })).toThrow(/maxIndex/)
    expect(() => new EntityPool({ maxGeneration: -1 })).toThrow(/maxGeneration/)
    expect(() => new EntityPool({ maxGeneration: 0 })).toThrow(/maxGeneration/)
    expect(() => new EntityPool({ maxGeneration: MAX_ENTITY_GENERATION + 1 })).toThrow(/maxGeneration/)
  })
})

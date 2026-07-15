import { describe, expect, it } from 'vitest'
import {
  addRegion,
  fromRegion,
  removeRegion,
  removeRegions,
  reorderRegion,
  replaceRegion,
  toRegion,
  updateRegion,
  type EditableRegion,
} from './regionOps'

function region(id: string, x = 0): EditableRegion {
  return { id, x, y: 0, w: 16, h: 16 }
}

describe('toRegion / fromRegion', () => {
  it('round-trips without leaking the client-only id into the descriptor shape', () => {
    const r = toRegion(region('a'))
    expect(r).toEqual({ x: 0, y: 0, w: 16, h: 16 })
    expect('id' in r).toBe(false)
  })

  it('fromRegion attaches an id to a bare descriptor region', () => {
    expect(fromRegion({ x: 1, y: 2, w: 3, h: 4 }, 'x')).toEqual({ id: 'x', x: 1, y: 2, w: 3, h: 4 })
  })
})

describe('addRegion', () => {
  it('appends by default', () => {
    const next = addRegion([region('a')], region('b'))
    expect(next.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('inserts at an explicit index', () => {
    const next = addRegion([region('a'), region('c')], region('b'), 1)
    expect(next.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input array', () => {
    const original = [region('a')]
    addRegion(original, region('b'))
    expect(original).toHaveLength(1)
  })
})

describe('removeRegion / removeRegions', () => {
  it('removes a single region by id', () => {
    const next = removeRegion([region('a'), region('b')], 'a')
    expect(next.map((r) => r.id)).toEqual(['b'])
  })

  it('is a no-op when the id is absent', () => {
    const original = [region('a')]
    expect(removeRegion(original, 'zzz')).toEqual(original)
  })

  it('removes a set of regions', () => {
    const next = removeRegions([region('a'), region('b'), region('c')], new Set(['a', 'c']))
    expect(next.map((r) => r.id)).toEqual(['b'])
  })
})

describe('reorderRegion', () => {
  it('moves a region later in the list', () => {
    const next = reorderRegion([region('a'), region('b'), region('c')], 0, 3)
    expect(next.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('moves a region earlier in the list', () => {
    const next = reorderRegion([region('a'), region('b'), region('c')], 2, 0)
    expect(next.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('is a no-op for an out-of-range fromIndex', () => {
    const original = [region('a'), region('b')]
    expect(reorderRegion(original, 5, 0).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('updateRegion', () => {
  it('patches only the matching region', () => {
    const next = updateRegion([region('a', 0), region('b', 0)], 'a', { x: 10 })
    expect(next.find((r) => r.id === 'a')?.x).toBe(10)
    expect(next.find((r) => r.id === 'b')?.x).toBe(0)
  })

  it('cannot delete a field via merge — the old value survives', () => {
    const withDirection: EditableRegion = { ...region('a'), direction: 'south' }
    const next = updateRegion([withDirection], 'a', {})
    expect(next[0]!.direction).toBe('south')
  })
})

describe('replaceRegion', () => {
  it('replaces the whole region object, including omitting fields the old one had', () => {
    const withDirection: EditableRegion = { ...region('a'), direction: 'south' }
    const replacement: EditableRegion = region('a')
    const next = replaceRegion([withDirection], replacement)
    expect(next[0]).toEqual(replacement)
    expect('direction' in next[0]!).toBe(false)
  })

  it('leaves other regions untouched', () => {
    const next = replaceRegion([region('a'), region('b')], region('a', 99))
    expect(next.find((r) => r.id === 'b')?.x).toBe(0)
  })
})

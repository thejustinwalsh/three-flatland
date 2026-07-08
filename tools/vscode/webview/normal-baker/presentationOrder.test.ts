import { describe, expect, it } from 'vitest'
import { reorderRegion } from './regionOps'
import {
  descriptorMoveArgs,
  presentationDragMoveArgs,
  presentationStepMoveArgs,
  presentationToDescriptorIndex,
  toPresentationOrder,
} from './presentationOrder'

// Minimal fixture — only `id` matters for these tests.
const REGIONS = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
  id,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
}))

function ids(regions: readonly { id: string }[]): string[] {
  return regions.map((r) => r.id)
}

describe('toPresentationOrder', () => {
  it('reverses descriptor order — top of the list paints last (wins)', () => {
    expect(ids(toPresentationOrder(REGIONS))).toEqual(['e', 'd', 'c', 'b', 'a'])
  })

  it('is self-inverse — applying it twice restores the original order', () => {
    expect(ids(toPresentationOrder(toPresentationOrder(REGIONS)))).toEqual(ids(REGIONS))
  })

  it('does not mutate the input array', () => {
    const copy = [...REGIONS]
    toPresentationOrder(REGIONS)
    expect(REGIONS).toEqual(copy)
  })
})

describe('presentationToDescriptorIndex', () => {
  it('maps presentation index 0 (top) to the last descriptor index', () => {
    expect(presentationToDescriptorIndex(0, 5)).toBe(4)
  })

  it('maps the last presentation index (bottom) to descriptor index 0', () => {
    expect(presentationToDescriptorIndex(4, 5)).toBe(0)
  })

  it('is self-inverse', () => {
    for (let i = 0; i < 5; i++) {
      expect(presentationToDescriptorIndex(presentationToDescriptorIndex(i, 5), 5)).toBe(i)
    }
  })
})

describe('descriptorMoveArgs + reorderRegion — final-index contract', () => {
  it('a forward move lands the item at the requested final index', () => {
    const { fromIndex, toIndex } = descriptorMoveArgs(0, 3)
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    expect(result[3]!.id).toBe('a')
    expect(ids(result)).toEqual(['b', 'c', 'd', 'a', 'e'])
  })

  it('a backward move lands the item at the requested final index', () => {
    const { fromIndex, toIndex } = descriptorMoveArgs(3, 0)
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    expect(result[0]!.id).toBe('d')
    expect(ids(result)).toEqual(['d', 'a', 'b', 'c', 'e'])
  })

  it('an adjacent forward move (the "move down" button case)', () => {
    const { fromIndex, toIndex } = descriptorMoveArgs(1, 2)
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    expect(ids(result)).toEqual(['a', 'c', 'b', 'd', 'e'])
  })

  it('an adjacent backward move (the "move up" button case)', () => {
    const { fromIndex, toIndex } = descriptorMoveArgs(2, 1)
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    expect(ids(result)).toEqual(['a', 'c', 'b', 'd', 'e'])
  })

  it('moving to the same index is a no-op', () => {
    const { fromIndex, toIndex } = descriptorMoveArgs(2, 2)
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    expect(ids(result)).toEqual(ids(REGIONS))
  })
})

describe('presentationStepMoveArgs — button semantics end-to-end', () => {
  it("'up' moves a region toward the top of the list (later paint, bigger winner)", () => {
    // presentation: [e,d,c,b,a] — 'c' is descriptor index 2, presentation index 2.
    const descriptorIndex = REGIONS.findIndex((r) => r.id === 'c')
    const { fromIndex, toIndex } = presentationStepMoveArgs(descriptorIndex, 'up')
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    const presentation = ids(toPresentationOrder(result))
    // 'c' should now be one slot closer to the top than before.
    const before = ids(toPresentationOrder(REGIONS)).indexOf('c')
    const after = presentation.indexOf('c')
    expect(after).toBe(before - 1)
  })

  it("'down' moves a region toward the bottom of the list (earlier paint, bigger loser)", () => {
    const descriptorIndex = REGIONS.findIndex((r) => r.id === 'c')
    const { fromIndex, toIndex } = presentationStepMoveArgs(descriptorIndex, 'down')
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    const presentation = ids(toPresentationOrder(result))
    const before = ids(toPresentationOrder(REGIONS)).indexOf('c')
    const after = presentation.indexOf('c')
    expect(after).toBe(before + 1)
  })

  it("repeated 'up' moves eventually put the region at the very top of the presentation list", () => {
    let regions = REGIONS
    for (let i = 0; i < 4; i++) {
      const descriptorIndex = regions.findIndex((r) => r.id === 'a')
      const { fromIndex, toIndex } = presentationStepMoveArgs(descriptorIndex, 'up')
      regions = reorderRegion(regions, fromIndex, toIndex)
    }
    expect(ids(toPresentationOrder(regions))[0]).toBe('a')
  })
})

describe('presentationDragMoveArgs — drag-and-drop end-to-end', () => {
  it('dragging the top row to just above the bottom row', () => {
    // presentation: [e,d,c,b,a]. Drag 'e' (index 0) to drop before 'a' (index 4).
    const { fromIndex, toIndex } = presentationDragMoveArgs(0, 4, REGIONS.length)
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    expect(ids(toPresentationOrder(result))).toEqual(['d', 'c', 'b', 'e', 'a'])
  })

  it('dragging a row down past several others', () => {
    // presentation: [e,d,c,b,a]. Drag 'd' (index 1) to drop before index 4 ('a').
    const { fromIndex, toIndex } = presentationDragMoveArgs(1, 4, REGIONS.length)
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    expect(ids(toPresentationOrder(result))).toEqual(['e', 'c', 'b', 'd', 'a'])
  })

  it('dragging a row up past several others', () => {
    // presentation: [e,d,c,b,a]. Drag 'a' (index 4) to drop before index 0 ('e').
    const { fromIndex, toIndex } = presentationDragMoveArgs(4, 0, REGIONS.length)
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    expect(ids(toPresentationOrder(result))).toEqual(['a', 'e', 'd', 'c', 'b'])
  })

  it('dragging to the very end of the list (dropBeforeIndex === length)', () => {
    // presentation: [e,d,c,b,a]. Drag 'e' (index 0) to the very end.
    const { fromIndex, toIndex } = presentationDragMoveArgs(0, REGIONS.length, REGIONS.length)
    const result = reorderRegion(REGIONS, fromIndex, toIndex)
    expect(ids(toPresentationOrder(result))).toEqual(['d', 'c', 'b', 'a', 'e'])
  })

  it('dropping a row back onto its own original slot is a no-op', () => {
    // Dropping row at presentation index 2 "before index 2" or "before
    // index 3" (its own two adjacent boundaries) must not move it.
    const before = ids(toPresentationOrder(REGIONS))
    const dropAtOwnSlot = presentationDragMoveArgs(2, 2, REGIONS.length)
    const resultA = reorderRegion(REGIONS, dropAtOwnSlot.fromIndex, dropAtOwnSlot.toIndex)
    expect(ids(toPresentationOrder(resultA))).toEqual(before)

    const dropJustAfterOwnSlot = presentationDragMoveArgs(2, 3, REGIONS.length)
    const resultB = reorderRegion(REGIONS, dropJustAfterOwnSlot.fromIndex, dropJustAfterOwnSlot.toIndex)
    expect(ids(toPresentationOrder(resultB))).toEqual(before)
  })
})

describe('Save round-trip — presentation reordering never touches descriptor serialization order on its own', () => {
  it('toPresentationOrder + toPresentationOrder back is byte-identical to the original descriptor array', () => {
    // Regression guard for the addendum's explicit ask: "descriptor
    // serialization order unchanged — Save round-trip byte-identical for
    // untouched descriptors." Presentation is a pure view-layer
    // transform; it must never be the thing that gets serialized.
    const roundTripped = toPresentationOrder(toPresentationOrder(REGIONS))
    expect(roundTripped).toEqual(REGIONS)
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(REGIONS))
  })
})

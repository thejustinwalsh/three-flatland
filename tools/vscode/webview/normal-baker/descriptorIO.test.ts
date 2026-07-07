import { describe, expect, it } from 'vitest'
import type { NormalSourceDescriptor } from '@three-flatland/normals'
import { descriptorToState, stateToDescriptor } from './descriptorIO'

function idGen(): () => string {
  let n = 0
  return () => `id-${n++}`
}

describe('descriptorToState', () => {
  it('returns empty state for a missing descriptor (no existing sidecar)', () => {
    expect(descriptorToState(null)).toEqual({ regions: [], defaults: {} })
    expect(descriptorToState(undefined)).toEqual({ regions: [], defaults: {} })
  })

  it('splits descriptor-level fields into defaults and regions get generated ids', () => {
    const descriptor: NormalSourceDescriptor = {
      version: 1,
      direction: 'south',
      pitch: 1.1,
      regions: [
        { x: 0, y: 0, w: 16, h: 16 },
        { x: 16, y: 0, w: 16, h: 16, direction: 'north' },
      ],
    }
    const { regions, defaults } = descriptorToState(descriptor, idGen())
    expect(defaults).toEqual({ direction: 'south', pitch: 1.1 })
    expect(regions).toEqual([
      { id: 'id-0', x: 0, y: 0, w: 16, h: 16 },
      { id: 'id-1', x: 16, y: 0, w: 16, h: 16, direction: 'north' },
    ])
  })

  it('treats an omitted regions array as empty', () => {
    const { regions } = descriptorToState({ version: 1, direction: 'south' })
    expect(regions).toEqual([])
  })
})

describe('stateToDescriptor', () => {
  it('assembles defaults + normalized regions, always stamping version 1', () => {
    const descriptor = stateToDescriptor(
      [
        { id: 'a', x: 0, y: 0, w: 16, h: 16 },
        { id: 'b', x: 16, y: 0, w: 16, h: 16, direction: 'south' },
      ],
      { direction: 'south' }
    )
    expect(descriptor).toEqual({
      version: 1,
      direction: 'south',
      regions: [
        { x: 0, y: 0, w: 16, h: 16 },
        { x: 16, y: 0, w: 16, h: 16 }, // direction: 'south' matches the default → stripped
      ],
    })
  })
})

describe('round-trip', () => {
  it('reproduces the original descriptor when nothing is edited', () => {
    const original: NormalSourceDescriptor = {
      version: 1,
      direction: 'south',
      pitch: 0.9,
      elevation: 0.5,
      regions: [
        { x: 0, y: 0, w: 16, h: 16 },
        { x: 16, y: 0, w: 16, h: 4, elevation: 1 },
        // elevation genuinely diverges from the descriptor default (0.5)
        // so the round-trip actually exercises "keep an override", not
        // just "correctly drop a redundant one" (see the dedicated
        // normalizeRegion tests in fieldResolution.test.ts for that case).
        { x: 16, y: 4, w: 16, h: 12, direction: 'south-west', elevation: 0.75 },
      ],
    }
    const { regions, defaults } = descriptorToState(original, idGen())
    expect(stateToDescriptor(regions, defaults)).toEqual(original)
  })

  it('does not invent explicit fields on regions that only ever inherited', () => {
    const original: NormalSourceDescriptor = {
      version: 1,
      direction: 'south',
      regions: [{ x: 0, y: 0, w: 16, h: 16 }],
    }
    const { regions, defaults } = descriptorToState(original, idGen())
    const roundtripped = stateToDescriptor(regions, defaults)
    expect(roundtripped.regions![0]).toEqual({ x: 0, y: 0, w: 16, h: 16 })
    expect('direction' in roundtripped.regions![0]!).toBe(false)
  })
})

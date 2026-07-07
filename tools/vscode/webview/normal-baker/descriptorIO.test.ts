import { describe, expect, it } from 'vitest'
import type { NormalSourceDescriptor } from '@three-flatland/normals'
import { descriptorToState, stateToDescriptor } from './descriptorIO'
import { clearRegionField } from './fieldResolution'

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
  it('assembles defaults + regions verbatim (minus the client-only id), always stamping version 1', () => {
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
        // Explicit direction: 'south' survives even though it currently
        // equals the descriptor default — an explicit choice is never
        // silently reinterpreted as "inherited" just because it happens
        // to match right now. See fieldResolution.ts's module doc.
        { x: 16, y: 0, w: 16, h: 16, direction: 'south' },
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

  it('keeps an explicit field that matches the descriptor default AT LOAD TIME, even when the default later changes', () => {
    // The bug this guards against: a region explicitly set to
    // direction: 'south' while the descriptor default was ALSO 'south'
    // must NOT be silently reinterpreted as "inherits the default" —
    // editing the default afterward (here to 'north') must leave this
    // region's own direction untouched at 'south'.
    const original: NormalSourceDescriptor = {
      version: 1,
      direction: 'south',
      regions: [{ x: 0, y: 0, w: 16, h: 16, direction: 'south' }],
    }
    const { regions, defaults } = descriptorToState(original, idGen())
    const editedDefaults = { ...defaults, direction: 'north' as const }
    const saved = stateToDescriptor(regions, editedDefaults)
    expect(saved.regions![0]!.direction).toBe('south')
  })

  it('resetting a field to inherited (clearRegionField) actually removes it from the saved output', () => {
    // The other side of fidelity: explicit stays explicit UNTIL the user
    // deliberately resets it — at which point it's gone, not "still there
    // but happens to equal the default."
    const original: NormalSourceDescriptor = {
      version: 1,
      direction: 'south',
      regions: [{ x: 0, y: 0, w: 16, h: 16, direction: 'north', elevation: 0.8 }],
    }
    const { regions, defaults } = descriptorToState(original, idGen())
    const reset = regions.map((r) => clearRegionField(r, 'direction'))
    const saved = stateToDescriptor(reset, defaults)
    expect('direction' in saved.regions![0]!).toBe(false)
    expect(saved.regions![0]!.elevation).toBe(0.8) // untouched field survives
  })
})

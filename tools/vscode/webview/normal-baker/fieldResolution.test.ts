import { describe, expect, it } from 'vitest'
import type { NormalRegion, NormalSourceDescriptor } from '@three-flatland/normals'
import {
  clearRegionField,
  isFieldOverridden,
  resolveBump,
  resolveDirection,
  resolveElevation,
  resolvePitch,
  resolveStrength,
} from './fieldResolution'

describe('resolve* — region ?? descriptor ?? built-in default', () => {
  it('falls all the way through to built-in defaults on an empty region + descriptor', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 1, h: 1 }
    const descriptor: NormalSourceDescriptor = {}
    expect(resolveBump(region, descriptor)).toBe('alpha')
    expect(resolveDirection(region, descriptor)).toBe('flat')
    expect(resolvePitch(region, descriptor)).toBe(Math.PI / 4)
    expect(resolveStrength(region, descriptor)).toBe(1)
    expect(resolveElevation(region, descriptor)).toBe(0)
  })

  it('inherits from the descriptor when the region omits a field', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 1, h: 1 }
    const descriptor: NormalSourceDescriptor = {
      bump: 'luminance',
      direction: 'south',
      pitch: 1.2,
      strength: 2,
      elevation: 0.5,
    }
    expect(resolveBump(region, descriptor)).toBe('luminance')
    expect(resolveDirection(region, descriptor)).toBe('south')
    expect(resolvePitch(region, descriptor)).toBe(1.2)
    expect(resolveStrength(region, descriptor)).toBe(2)
    expect(resolveElevation(region, descriptor)).toBe(0.5)
  })

  it('prefers an explicit region field over the descriptor default', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 1, h: 1, bump: 'none', direction: 'east' }
    const descriptor: NormalSourceDescriptor = { bump: 'luminance', direction: 'south' }
    expect(resolveBump(region, descriptor)).toBe('none')
    expect(resolveDirection(region, descriptor)).toBe('east')
  })
})

describe('isFieldOverridden', () => {
  it('is false when the field is absent (inheriting)', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 1, h: 1 }
    expect(isFieldOverridden(region, 'direction')).toBe(false)
  })

  it('is true when the field is explicitly set, even to a "falsy-looking" value', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 1, h: 1, strength: 0, elevation: 0 }
    expect(isFieldOverridden(region, 'strength')).toBe(true)
    expect(isFieldOverridden(region, 'elevation')).toBe(true)
  })
})

describe('clearRegionField', () => {
  it('removes an explicit field, reverting the region to inheriting it', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16, direction: 'south', elevation: 1 }
    const next = clearRegionField(region, 'direction')
    expect('direction' in next).toBe(false)
    expect(next.elevation).toBe(1) // untouched fields survive
  })

  it('is a no-op (still absent) when the field was already unset', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16 }
    expect(clearRegionField(region, 'bump')).toEqual(region)
  })

  it('does not mutate the input region', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16, pitch: 0.5 }
    clearRegionField(region, 'pitch')
    expect(region.pitch).toBe(0.5)
  })
})

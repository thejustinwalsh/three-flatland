import { describe, expect, it } from 'vitest'
import type { NormalRegion, NormalSourceDescriptor } from '@three-flatland/normals'
import {
  normalizeRegion,
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

describe('normalizeRegion', () => {
  it('leaves a region with no explicit fields untouched (round-trip: no invented fields)', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16 }
    const descriptor: NormalSourceDescriptor = { direction: 'south', elevation: 0.5 }
    expect(normalizeRegion(region, descriptor)).toEqual(region)
  })

  it('strips a field that exactly matches the descriptor default', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16, direction: 'south', elevation: 0.5 }
    const descriptor: NormalSourceDescriptor = { direction: 'south', elevation: 0.5 }
    expect(normalizeRegion(region, descriptor)).toEqual({ x: 0, y: 0, w: 16, h: 16 })
  })

  it('strips a direction field that is an alias-equivalent match, not just a string match', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16, direction: 'up' }
    const descriptor: NormalSourceDescriptor = { direction: 'north' }
    expect(normalizeRegion(region, descriptor)).toEqual({ x: 0, y: 0, w: 16, h: 16 })
  })

  it('keeps a field that diverges from the descriptor default', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16, direction: 'east', strength: 2 }
    const descriptor: NormalSourceDescriptor = { direction: 'south', strength: 1 }
    expect(normalizeRegion(region, descriptor)).toEqual({
      x: 0,
      y: 0,
      w: 16,
      h: 16,
      direction: 'east',
      strength: 2,
    })
  })

  it('strips a numeric field within epsilon of the default', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16, pitch: Math.PI / 4 + 1e-12 }
    const descriptor: NormalSourceDescriptor = {}
    expect(normalizeRegion(region, descriptor)).toEqual({ x: 0, y: 0, w: 16, h: 16 })
  })

  it('does not mutate the input region', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16, direction: 'south' }
    const descriptor: NormalSourceDescriptor = { direction: 'south' }
    normalizeRegion(region, descriptor)
    expect(region.direction).toBe('south')
  })
})

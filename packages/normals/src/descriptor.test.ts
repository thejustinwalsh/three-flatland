import { describe, it, expect } from 'vitest'
import {
  directionToAngle,
  resolveRegion,
  DEFAULT_PITCH,
  DEFAULT_STRENGTH,
  type NormalSourceDescriptor,
} from './descriptor.js'

describe('directionToAngle', () => {
  it('returns null for flat and undefined', () => {
    expect(directionToAngle('flat')).toBeNull()
    expect(directionToAngle(undefined)).toBeNull()
  })

  it('maps cardinal aliases to the same angles', () => {
    expect(directionToAngle('up')).toBe(directionToAngle('north'))
    expect(directionToAngle('down')).toBe(directionToAngle('south'))
    expect(directionToAngle('left')).toBe(directionToAngle('west'))
    expect(directionToAngle('right')).toBe(directionToAngle('east'))
  })

  it('maps compound aliases to the same angles', () => {
    expect(directionToAngle('up-left')).toBe(directionToAngle('north-west'))
    expect(directionToAngle('up-right')).toBe(directionToAngle('north-east'))
    expect(directionToAngle('down-left')).toBe(directionToAngle('south-west'))
    expect(directionToAngle('down-right')).toBe(directionToAngle('south-east'))
  })

  it('returns math-convention radians for cardinals', () => {
    expect(directionToAngle('right')).toBe(0)
    expect(directionToAngle('up')).toBe(Math.PI / 2)
    expect(directionToAngle('left')).toBe(Math.PI)
    expect(directionToAngle('down')).toBe(-Math.PI / 2)
  })

  it('returns math-convention radians for diagonals', () => {
    expect(directionToAngle('up-right')).toBe(Math.PI / 4)
    expect(directionToAngle('up-left')).toBe((3 * Math.PI) / 4)
    expect(directionToAngle('down-right')).toBe(-Math.PI / 4)
    expect(directionToAngle('down-left')).toBe((-3 * Math.PI) / 4)
  })

  it('passes numeric radians through unchanged', () => {
    expect(directionToAngle(0)).toBe(0)
    expect(directionToAngle(1.5)).toBe(1.5)
    expect(directionToAngle(-0.5)).toBe(-0.5)
  })
})

describe('resolveRegion', () => {
  it('fills in defaults from an empty descriptor', () => {
    const resolved = resolveRegion({ x: 0, y: 0, w: 16, h: 16 })
    expect(resolved.bump).toBe('alpha')
    expect(resolved.angle).toBeNull()
    expect(resolved.pitch).toBe(DEFAULT_PITCH)
    expect(resolved.strength).toBe(DEFAULT_STRENGTH)
  })

  it('inherits descriptor-level defaults', () => {
    const desc: NormalSourceDescriptor = {
      bump: 'none',
      direction: 'south',
      pitch: 0.3,
      strength: 2,
    }
    const resolved = resolveRegion({ x: 0, y: 0, w: 16, h: 16 }, desc)
    expect(resolved.bump).toBe('none')
    expect(resolved.angle).toBe(-Math.PI / 2)
    expect(resolved.pitch).toBe(0.3)
    expect(resolved.strength).toBe(2)
  })

  it('region fields override descriptor defaults', () => {
    const desc: NormalSourceDescriptor = {
      bump: 'alpha',
      direction: 'south',
      pitch: 0.3,
    }
    const resolved = resolveRegion(
      { x: 0, y: 0, w: 16, h: 16, bump: 'none', direction: 'north', pitch: 0.9 },
      desc
    )
    expect(resolved.bump).toBe('none')
    expect(resolved.angle).toBe(Math.PI / 2)
    expect(resolved.pitch).toBe(0.9)
  })

  it('preserves rect fields verbatim', () => {
    const resolved = resolveRegion({ x: 4, y: 8, w: 12, h: 10 })
    expect(resolved.x).toBe(4)
    expect(resolved.y).toBe(8)
    expect(resolved.w).toBe(12)
    expect(resolved.h).toBe(10)
  })
})

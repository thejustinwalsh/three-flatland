import { describe, expect, it } from 'vitest'
import { activeCompassDirection, directionColor, directionHue } from './direction'

describe('directionHue', () => {
  it('returns null for flat and undefined', () => {
    expect(directionHue('flat')).toBeNull()
    expect(directionHue(undefined)).toBeNull()
  })

  it('is stable across the 8 named directions', () => {
    expect(directionHue('east')).toBe(0)
    expect(directionHue('north')).toBe(90)
    expect(directionHue('west')).toBe(180)
    expect(directionHue('south')).toBe(270)
    expect(directionHue('north-east')).toBe(45)
    expect(directionHue('south-east')).toBe(315)
  })

  it('gives opposite directions complementary (180°-apart) hues', () => {
    const east = directionHue('east')!
    const west = directionHue('west')!
    expect(Math.abs(east - west)).toBe(180)
  })

  it('agrees between aliases that resolve to the same angle', () => {
    expect(directionHue('up')).toBe(directionHue('north'))
    expect(directionHue('down')).toBe(directionHue('south'))
  })

  it('is a pure function of angle for custom numeric directions', () => {
    expect(directionHue(Math.PI / 2)).toBe(directionHue('north'))
  })
})

describe('directionColor', () => {
  it('renders flat as neutral gray', () => {
    expect(directionColor('flat')).toBe('rgba(136, 136, 136, 1)')
    expect(directionColor(undefined)).toBe('rgba(136, 136, 136, 1)')
  })

  it('renders a named direction as an hsla string carrying its hue', () => {
    expect(directionColor('east')).toBe('hsla(0.0, 70%, 55%, 1)')
    expect(directionColor('north', { saturation: 50, lightness: 40, alpha: 0.5 })).toBe(
      'hsla(90.0, 50%, 40%, 0.5)'
    )
  })
})

describe('activeCompassDirection', () => {
  it('maps flat and undefined to the flat cell', () => {
    expect(activeCompassDirection('flat')).toBe('flat')
    expect(activeCompassDirection(undefined)).toBe('flat')
  })

  it('maps every named direction to itself', () => {
    expect(activeCompassDirection('north')).toBe('north')
    expect(activeCompassDirection('south-west')).toBe('south-west')
  })

  it('maps an alias to its canonical NSEW compass cell', () => {
    expect(activeCompassDirection('up')).toBe('north')
    expect(activeCompassDirection('up-right')).toBe('north-east')
  })

  it('maps a numeric angle matching a named direction to that cell', () => {
    expect(activeCompassDirection(Math.PI)).toBe('west')
  })

  it('returns null for a custom angle off the 8-way compass', () => {
    expect(activeCompassDirection(0.1)).toBeNull()
  })
})

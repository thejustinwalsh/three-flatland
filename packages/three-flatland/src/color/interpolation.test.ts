import { describe, it, expect } from 'vitest'
import { Color } from 'three'
import { lerpOklch, lerpOklab, gradientOklch } from './interpolation'

const EPSILON = 1e-3

describe('lerpOklch', () => {
  const red = new Color(1, 0, 0)
  const blue = new Color(0, 0, 1)

  it('returns start color at t=0', () => {
    const result = lerpOklch(red, blue, 0)
    expect(result.r).toBeCloseTo(red.r, 2)
    expect(result.g).toBeCloseTo(red.g, 2)
    expect(result.b).toBeCloseTo(red.b, 2)
  })

  it('returns end color at t=1', () => {
    const result = lerpOklch(red, blue, 1)
    expect(result.r).toBeCloseTo(blue.r, 2)
    expect(result.g).toBeCloseTo(blue.g, 2)
    expect(result.b).toBeCloseTo(blue.b, 2)
  })

  it('returns midpoint at t=0.5', () => {
    const result = lerpOklch(red, blue, 0.5)
    // Should be some visible color, not black
    expect(result.r + result.g + result.b).toBeGreaterThan(0)
  })

  it('accepts a reusable target', () => {
    const target = new Color()
    const result = lerpOklch(red, blue, 0.5, target)
    expect(result).toBe(target)
  })
})

describe('lerpOklab', () => {
  const white = new Color(1, 1, 1)
  const black = new Color(0, 0, 0)

  it('returns start at t=0 and end at t=1', () => {
    const start = lerpOklab(white, black, 0)
    expect(start.r).toBeCloseTo(1, 2)
    const end = lerpOklab(white, black, 1)
    expect(end.r).toBeCloseTo(0, 2)
  })

  it('midpoint of black and white is a perceptual mid-gray', () => {
    const mid = lerpOklab(black, white, 0.5)
    // Components are working-space linear. A perceptual-50% gray (OKLAB L=0.5)
    // maps to a linear component near 0.125, not 0.5.
    expect(mid.r).toBeCloseTo(mid.g, 5)
    expect(mid.g).toBeCloseTo(mid.b, 5)
    expect(mid.r).toBeGreaterThan(0)
    expect(mid.r).toBeLessThan(1)
    expect(mid.r).toBeCloseTo(0.125, 3)
  })
})

describe('gradientOklch', () => {
  const red = new Color(1, 0, 0)
  const green = new Color(0, 1, 0)

  it('returns correct number of steps', () => {
    expect(gradientOklch(red, green, 5)).toHaveLength(5)
    expect(gradientOklch(red, green, 1)).toHaveLength(1)
  })

  it('endpoints match input colors', () => {
    const gradient = gradientOklch(red, green, 5)
    expect(gradient[0].r).toBeCloseTo(red.r, 2)
    expect(gradient[0].g).toBeCloseTo(red.g, 2)
    expect(gradient[4].g).toBeCloseTo(green.g, 2)
  })
})

import { describe, expect, it } from 'vitest'
import { approach, SPRITE_SCALE, targetScale, toPointerNdc } from './interaction'

describe('targetScale', () => {
  it('rests at the idle scale', () => {
    expect(targetScale({ hovered: false, pressed: false })).toBe(SPRITE_SCALE.idle)
  })

  it('grows on hover and shrinks on press', () => {
    expect(targetScale({ hovered: true, pressed: false })).toBe(SPRITE_SCALE.hover)
    expect(targetScale({ hovered: false, pressed: true })).toBe(SPRITE_SCALE.press)
  })

  it('lets press win over hover — a pressed sprite is always hovered too', () => {
    expect(targetScale({ hovered: true, pressed: true })).toBe(SPRITE_SCALE.press)
  })
})

describe('approach', () => {
  it('moves toward the target by the easing fraction', () => {
    expect(approach(100, 200, 0.25)).toBe(125)
  })

  it('converges without ever overshooting', () => {
    let value: number = SPRITE_SCALE.idle
    for (let i = 0; i < 120; i++) value = approach(value, SPRITE_SCALE.hover)
    expect(value).toBeGreaterThan(SPRITE_SCALE.idle)
    expect(value).toBeLessThanOrEqual(SPRITE_SCALE.hover)
    expect(value).toBeCloseTo(SPRITE_SCALE.hover, 5)
  })

  it('clamps the easing fraction so it cannot overshoot and oscillate', () => {
    expect(approach(0, 100, 5)).toBe(100)
    expect(approach(0, 100, -1)).toBe(0)
  })

  it('is a no-op once it has arrived', () => {
    expect(approach(150, 150)).toBe(150)
  })
})

describe('toPointerNdc', () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 }

  it('maps the centre to the origin', () => {
    expect(toPointerNdc(400, 300, rect)).toEqual({ x: 0, y: 0 })
  })

  it('flips the Y axis — client Y grows down, NDC Y grows up', () => {
    expect(toPointerNdc(0, 0, rect)).toEqual({ x: -1, y: 1 })
    expect(toPointerNdc(800, 600, rect)).toEqual({ x: 1, y: -1 })
  })

  it('accounts for a canvas that is not at the page origin', () => {
    expect(toPointerNdc(140, 90, { left: 40, top: 40, width: 200, height: 100 })).toEqual({ x: 0, y: 0 })
  })

  it('returns the origin instead of NaN for a zero-size rect', () => {
    // A canvas queried before layout reports 0×0. Dividing by that would hand
    // the raycaster NaN, which silently disables every hit test.
    const ndc = toPointerNdc(10, 10, { left: 0, top: 0, width: 0, height: 0 })
    expect(Number.isNaN(ndc.x)).toBe(false)
    expect(Number.isNaN(ndc.y)).toBe(false)
    expect(ndc).toEqual({ x: 0, y: 0 })
  })
})

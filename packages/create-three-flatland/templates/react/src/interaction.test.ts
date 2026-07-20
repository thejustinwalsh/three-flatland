import { describe, expect, it } from 'vitest'
import { approach, SPRITE_SCALE, SPRITE_TINT, targetScale, tintFor } from './interaction'

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

describe('tintFor', () => {
  it('tints only while hovered, regardless of press state', () => {
    expect(tintFor({ hovered: false, pressed: false })).toBe(SPRITE_TINT.idle)
    expect(tintFor({ hovered: true, pressed: false })).toBe(SPRITE_TINT.hover)
    expect(tintFor({ hovered: true, pressed: true })).toBe(SPRITE_TINT.hover)
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

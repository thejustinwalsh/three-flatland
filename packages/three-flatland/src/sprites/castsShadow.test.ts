import { describe, it, expect } from 'vitest'
import {
  Sprite2D,
  LIT_FLAG_MASK,
  RECEIVE_SHADOWS_MASK,
  CAST_SHADOW_MASK,
  PIXEL_PERFECT_MASK,
  EFFECT_BIT_OFFSET,
} from './Sprite2D'

describe('Sprite2D castsShadow flag', () => {
  it('defaults to false (opt-in)', () => {
    const sprite = new Sprite2D()
    expect(sprite.castsShadow).toBe(false)
    expect(sprite._systemFlags & CAST_SHADOW_MASK).toBe(0)
  })

  it('constructor option enables the bit', () => {
    const sprite = new Sprite2D({ castsShadow: true })
    expect(sprite.castsShadow).toBe(true)
    expect(sprite._systemFlags & CAST_SHADOW_MASK).toBe(CAST_SHADOW_MASK)
  })

  it('setter flips the bit without touching other system flags', () => {
    const sprite = new Sprite2D()
    const before = sprite._systemFlags
    expect(before & LIT_FLAG_MASK).toBe(LIT_FLAG_MASK)
    expect(before & RECEIVE_SHADOWS_MASK).toBe(RECEIVE_SHADOWS_MASK)

    sprite.castsShadow = true
    expect(sprite.castsShadow).toBe(true)
    // lit + receiveShadows still set
    expect(sprite._systemFlags & LIT_FLAG_MASK).toBe(LIT_FLAG_MASK)
    expect(sprite._systemFlags & RECEIVE_SHADOWS_MASK).toBe(RECEIVE_SHADOWS_MASK)

    sprite.castsShadow = false
    expect(sprite.castsShadow).toBe(false)
    expect(sprite._systemFlags & LIT_FLAG_MASK).toBe(LIT_FLAG_MASK)
    expect(sprite._systemFlags & RECEIVE_SHADOWS_MASK).toBe(RECEIVE_SHADOWS_MASK)
  })

  it('setting to current value is a no-op', () => {
    const sprite = new Sprite2D()
    const before = sprite._systemFlags
    sprite.castsShadow = false // already false
    expect(sprite._systemFlags).toBe(before)
  })

  it('system flag bits occupy their own component so MaterialEffect bits are unaffected', () => {
    // System flags live in instanceSystem.z; MaterialEffect enable bits live
    // in instanceSystem.w. The components are disjoint, so EFFECT_BIT_OFFSET
    // stays at 0 — the first registered effect's enable bit is bit 0 of w.
    expect(LIT_FLAG_MASK).toBe(1)
    expect(RECEIVE_SHADOWS_MASK).toBe(2)
    expect(CAST_SHADOW_MASK).toBe(4)
    expect(PIXEL_PERFECT_MASK).toBe(16)
    expect(EFFECT_BIT_OFFSET).toBe(0)
  })

  it('toggling castsShadow does not deopt existing lit / receiveShadows state', () => {
    const sprite = new Sprite2D({
      lit: false,
      receiveShadows: false,
      castsShadow: true,
    })
    expect(sprite.lit).toBe(false)
    expect(sprite.receiveShadows).toBe(false)
    expect(sprite.castsShadow).toBe(true)
    // Pixel snapping remains enabled by the rendering default.
    expect(sprite._systemFlags).toBe(CAST_SHADOW_MASK | PIXEL_PERFECT_MASK)
  })
})

describe('Sprite2D pixelPerfect flag', () => {
  it('defaults on and updates the shared system-flags word', () => {
    const sprite = new Sprite2D()

    expect(sprite.pixelPerfect).toBe(true)
    expect(sprite._systemFlags & PIXEL_PERFECT_MASK).toBe(PIXEL_PERFECT_MASK)

    sprite.pixelPerfect = false
    expect(sprite.pixelPerfect).toBe(false)
    expect(sprite._systemFlags & PIXEL_PERFECT_MASK).toBe(0)
    expect(sprite.lit).toBe(true)
    expect(sprite.receiveShadows).toBe(true)

    sprite.pixelPerfect = true
    expect(sprite._systemFlags & PIXEL_PERFECT_MASK).toBe(PIXEL_PERFECT_MASK)
  })

  it('honors the constructor option and writes standalone GPU attributes', () => {
    const sprite = new Sprite2D({ pixelPerfect: true })
    const system = sprite.geometry.getAttribute('instanceSystem')

    expect(sprite.pixelPerfect).toBe(true)
    expect(Number(system.getZ(0)) & PIXEL_PERFECT_MASK).toBe(PIXEL_PERFECT_MASK)
  })
})

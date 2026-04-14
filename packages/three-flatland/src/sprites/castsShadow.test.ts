import { describe, it, expect } from 'vitest'
import {
  Sprite2D,
  LIT_FLAG_MASK,
  RECEIVE_SHADOWS_MASK,
  CAST_SHADOW_MASK,
  EFFECT_BIT_OFFSET,
} from './Sprite2D'

describe('Sprite2D castsShadow flag', () => {
  it('defaults to false (opt-in)', () => {
    const sprite = new Sprite2D()
    expect(sprite.castsShadow).toBe(false)
    expect(sprite._effectFlags & CAST_SHADOW_MASK).toBe(0)
  })

  it('constructor option enables the bit', () => {
    const sprite = new Sprite2D({ castsShadow: true })
    expect(sprite.castsShadow).toBe(true)
    expect(sprite._effectFlags & CAST_SHADOW_MASK).toBe(CAST_SHADOW_MASK)
  })

  it('setter flips the bit without touching other system flags', () => {
    const sprite = new Sprite2D()
    const before = sprite._effectFlags
    expect(before & LIT_FLAG_MASK).toBe(LIT_FLAG_MASK)
    expect(before & RECEIVE_SHADOWS_MASK).toBe(RECEIVE_SHADOWS_MASK)

    sprite.castsShadow = true
    expect(sprite.castsShadow).toBe(true)
    // lit + receiveShadows still set
    expect(sprite._effectFlags & LIT_FLAG_MASK).toBe(LIT_FLAG_MASK)
    expect(sprite._effectFlags & RECEIVE_SHADOWS_MASK).toBe(RECEIVE_SHADOWS_MASK)

    sprite.castsShadow = false
    expect(sprite.castsShadow).toBe(false)
    expect(sprite._effectFlags & LIT_FLAG_MASK).toBe(LIT_FLAG_MASK)
    expect(sprite._effectFlags & RECEIVE_SHADOWS_MASK).toBe(RECEIVE_SHADOWS_MASK)
  })

  it('setting to current value is a no-op', () => {
    const sprite = new Sprite2D()
    const before = sprite._effectFlags
    sprite.castsShadow = false // already false
    expect(sprite._effectFlags).toBe(before)
  })

  it('three system bits coexist without colliding with MaterialEffect bits', () => {
    // EFFECT_BIT_OFFSET must reserve space for all three system bits.
    expect(EFFECT_BIT_OFFSET).toBeGreaterThanOrEqual(3)
    expect(LIT_FLAG_MASK).toBe(1)
    expect(RECEIVE_SHADOWS_MASK).toBe(2)
    expect(CAST_SHADOW_MASK).toBe(4)
    expect(1 << EFFECT_BIT_OFFSET).toBe(8) // first MaterialEffect bit = 8
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
    // Raw flags: only CAST_SHADOW_MASK
    expect(sprite._effectFlags).toBe(CAST_SHADOW_MASK)
  })
})

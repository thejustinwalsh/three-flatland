import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { vec4 } from 'three/tsl'
import { Flatland } from '../Flatland'
import { createLightEffect } from '../lights/LightEffect'
import { createMaterialEffect } from '../materials/MaterialEffect'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { Sprite2D, LIT_FLAG_MASK, RECEIVE_SHADOWS_MASK, PIXEL_PERFECT_MASK } from '../sprites/Sprite2D'

// Default low bits set by the coordinated pixel-art preset.
const DEFAULT_FLAGS = LIT_FLAG_MASK | RECEIVE_SHADOWS_MASK | PIXEL_PERFECT_MASK
import { attachEffect, attachLighting } from './attach'

const Dissolve = createMaterialEffect({
  name: 'dissolve_attach_test',
  schema: { progress: 0 },
  node: ({ inputColor }) => inputColor,
})

const Flash = createMaterialEffect({
  name: 'flash_attach_test',
  schema: { intensity: 0 },
  node: ({ inputColor }) => inputColor,
})

const FirstLighting = createLightEffect({
  name: 'first_attach_lighting',
  schema: { ambient: 1 },
  light: () => (context) => vec4(context.color.rgb, context.color.a),
})

const SecondLighting = createLightEffect({
  name: 'second_attach_lighting',
  schema: { ambient: 1 },
  light: () => (context) => vec4(context.color.rgb, context.color.a),
})

describe('attachEffect', () => {
  let texture: Texture
  let material: Sprite2DMaterial
  let sprite: Sprite2D

  beforeEach(() => {
    texture = new Texture()
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Dissolve)
    material.registerEffect(Flash)
    sprite = new Sprite2D({ texture, material })
  })

  it('adds effect on first attach', () => {
    const d = new Dissolve()
    attachEffect(sprite, d)

    expect(sprite._effects).toHaveLength(1)
    expect(sprite._effects[0]).toBe(d)
  })

  it('skips add when same instance re-attached (R3F re-render)', () => {
    const d = new Dissolve()
    attachEffect(sprite, d)

    // R3F re-render: passes same instance again
    attachEffect(sprite, d)

    // Single instance, no duplicate
    expect(sprite._effects).toHaveLength(1)
    expect(sprite._effects[0]).toBe(d)
  })

  it('preserves imperative state through re-renders', () => {
    const d = new Dissolve()
    attachEffect(sprite, d)

    // useFrame updates progress
    d.progress = 0.7

    // R3F re-render — same instance, skip
    attachEffect(sprite, d)

    // Value preserved
    expect((sprite._effects[0] as any).progress).toBeCloseTo(0.7)
  })

  it('removes effect synchronously on cleanup', () => {
    const d = new Dissolve()
    const cleanup = attachEffect(sprite, d)

    cleanup()
    expect(sprite._effects).toHaveLength(0)
    expect(sprite._systemFlags).toBe(DEFAULT_FLAGS)
  })

  it('does not interfere with different effect types', () => {
    const d = new Dissolve()
    const f = new Flash()

    const cleanupD = attachEffect(sprite, d)
    attachEffect(sprite, f)

    expect(sprite._effects).toHaveLength(2)

    cleanupD()

    expect(sprite._effects).toHaveLength(1)
    expect(sprite._effects[0]!.name).toBe('flash_attach_test')
  })

  it('allows re-adding after removal', () => {
    const d1 = new Dissolve()
    const cleanup = attachEffect(sprite, d1)

    cleanup()
    expect(sprite._effects).toHaveLength(0)

    // Re-mount
    const d2 = new Dissolve()
    attachEffect(sprite, d2)
    expect(sprite._effects).toHaveLength(1)
    expect(sprite._effects[0]).toBe(d2)
  })
})

describe('attachLighting', () => {
  it('does not clear a newer replacement when stale R3F cleanup runs', () => {
    const flatland = new Flatland()
    const first = new FirstLighting()
    const second = new SecondLighting()
    const cleanupFirst = attachLighting(flatland, first)
    const cleanupSecond = attachLighting(flatland, second)

    cleanupFirst()
    expect(flatland.lighting).toBe(second)

    cleanupSecond()
    expect(flatland.lighting).toBeNull()
    flatland.dispose()
  })
})

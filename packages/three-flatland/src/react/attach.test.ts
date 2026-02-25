import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { createMaterialEffect } from '../materials/MaterialEffect'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { Sprite2D } from '../sprites/Sprite2D'
import { attachEffect } from './attach'

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

describe('attachEffect', () => {
  let texture: Texture
  let material: Sprite2DMaterial
  let sprite: Sprite2D

  beforeEach(() => {
    texture = new Texture()
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
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
    expect(sprite._effectFlags).toBe(0)
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

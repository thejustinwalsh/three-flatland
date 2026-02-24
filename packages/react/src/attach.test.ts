import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import {
  createMaterialEffect,
  Sprite2DMaterial,
  Sprite2D,
} from '@three-flatland/core'
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

const flush = () => new Promise<void>((r) => queueMicrotask(r))

describe('attachEffect', () => {
  let texture: Texture
  let material: Sprite2DMaterial
  let sprite: Sprite2D

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
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

  it('defers removal to microtask', async () => {
    const d = new Dissolve()
    const cleanup = attachEffect(sprite, d)

    cleanup()
    expect(sprite._effects).toHaveLength(1) // still there

    await flush()
    expect(sprite._effects).toHaveLength(0) // now removed
  })

  it('real unmount removes correctly', async () => {
    const d = new Dissolve()
    const cleanup = attachEffect(sprite, d)

    cleanup()
    await flush()

    expect(sprite._effects).toHaveLength(0)
    expect(sprite._effectFlags).toBe(0)
  })

  it('does not interfere with different effect types', async () => {
    const d = new Dissolve()
    const f = new Flash()

    const cleanupD = attachEffect(sprite, d)
    attachEffect(sprite, f)

    expect(sprite._effects).toHaveLength(2)

    cleanupD()
    await flush()

    expect(sprite._effects).toHaveLength(1)
    expect(sprite._effects[0]!.name).toBe('flash_attach_test')
  })

  it('allows re-adding after real removal', async () => {
    const d1 = new Dissolve()
    const cleanup = attachEffect(sprite, d1)

    // Real unmount
    cleanup()
    await flush()
    expect(sprite._effects).toHaveLength(0)

    // Re-mount
    const d2 = new Dissolve()
    attachEffect(sprite, d2)
    expect(sprite._effects).toHaveLength(1)
    expect(sprite._effects[0]).toBe(d2)
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture } from 'three'
import { createWorld, universe } from 'koota'
import { MaterialEffect, createMaterialEffect } from './MaterialEffect'
import type { EffectNodeContext } from './MaterialEffect'
import { Sprite2DMaterial } from './Sprite2DMaterial'
import { Sprite2D } from '../sprites/Sprite2D'

// ============================================
// createMaterialEffect — factory API
// ============================================

describe('createMaterialEffect', () => {
  it('should create a class with correct effectName and schema', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    expect(Dissolve.effectName).toBe('dissolve')
    expect(Dissolve.effectSchema.progress).toBe(0)
  })

  it('should auto-create a Koota trait from schema', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    // Initialize to create the trait
    Dissolve._initialize()
    expect(typeof Dissolve._trait).toBe('function')
  })

  it('should compute field metadata from schema', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    Dissolve._initialize()
    expect(Dissolve._fields).toHaveLength(1)
    expect(Dissolve._fields[0]!.name).toBe('progress')
    expect(Dissolve._fields[0]!.size).toBe(1)
    expect(Dissolve._fields[0]!.default).toEqual([0])
    expect(Dissolve._totalFloats).toBe(1)
  })

  it('should infer float from number', () => {
    const Effect = createMaterialEffect({
      name: 'test',
      schema: { value: 0.5 },
      node: ({ inputColor }) => inputColor,
    })

    Effect._initialize()
    expect(Effect._fields[0]!.size).toBe(1)
    expect(Effect._fields[0]!.default).toEqual([0.5])
    expect(Effect._totalFloats).toBe(1)
  })

  it('should infer vec2 from 2-tuple', () => {
    const Effect = createMaterialEffect({
      name: 'test',
      schema: { offset: [0, 0] },
      node: ({ inputColor }) => inputColor,
    })

    Effect._initialize()
    expect(Effect._fields[0]!.size).toBe(2)
    expect(Effect._fields[0]!.default).toEqual([0, 0])
    expect(Effect._totalFloats).toBe(2)
  })

  it('should infer vec3 from 3-tuple', () => {
    const Effect = createMaterialEffect({
      name: 'test',
      schema: { color: [1, 0, 0] },
      node: ({ inputColor }) => inputColor,
    })

    Effect._initialize()
    expect(Effect._fields[0]!.size).toBe(3)
    expect(Effect._fields[0]!.default).toEqual([1, 0, 0])
    expect(Effect._totalFloats).toBe(3)
  })

  it('should infer vec4 from 4-tuple', () => {
    const Effect = createMaterialEffect({
      name: 'test',
      schema: { tint: [1, 1, 1, 1] },
      node: ({ inputColor }) => inputColor,
    })

    Effect._initialize()
    expect(Effect._fields[0]!.size).toBe(4)
    expect(Effect._fields[0]!.default).toEqual([1, 1, 1, 1])
    expect(Effect._totalFloats).toBe(4)
  })

  it('should support multiple schema fields', () => {
    const Effect = createMaterialEffect({
      name: 'outline',
      schema: {
        width: 1,
        color: [1, 1, 1],
      },
      node: ({ inputColor }) => inputColor,
    })

    Effect._initialize()
    expect(Effect._fields).toHaveLength(2)
    expect(Effect._fields[0]!.name).toBe('width')
    expect(Effect._fields[0]!.size).toBe(1)
    expect(Effect._fields[0]!.default).toEqual([1])
    expect(Effect._fields[1]!.name).toBe('color')
    expect(Effect._fields[1]!.size).toBe(3)
    expect(Effect._fields[1]!.default).toEqual([1, 1, 1])
    expect(Effect._totalFloats).toBe(4)
  })

  it('should store the node builder function', () => {
    const nodeFn = ({ inputColor }: { inputColor: unknown }) => inputColor
    const Effect = createMaterialEffect({
      name: 'test',
      schema: { value: 0 },
      node: nodeFn,
    })

    Effect._initialize()
    expect(Effect._node).toBeDefined()
  })
})

// ============================================
// Class-based MaterialEffect definition
// ============================================

describe('class-based MaterialEffect', () => {
  it('should work with static fields and buildNode', () => {
    class DissolveEffect extends MaterialEffect {
      static readonly effectName = 'dissolve'
      static readonly effectSchema = { progress: 0 } as const
      declare progress: number

      static override buildNode({ inputColor }: EffectNodeContext) {
        return inputColor
      }
    }

    const dissolve = new DissolveEffect()
    expect(dissolve.name).toBe('dissolve')
    expect(dissolve.progress).toBe(0)
  })
})

// ============================================
// MaterialEffect instances — property accessors
// ============================================

describe('MaterialEffect instances', () => {
  it('should construct with default values', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const dissolve = new Dissolve()
    expect(dissolve.progress).toBe(0)
  })

  it('should set properties via setters', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    expect(dissolve.progress).toBe(0.5)
  })

  it('should support vec3 field defaults and setters', () => {
    const Flash = createMaterialEffect({
      name: 'flash',
      schema: { color: [1, 0, 0] },
      node: ({ inputColor }) => inputColor,
    })

    const flash = new Flash()
    expect(flash.color).toEqual([1, 0, 0])

    flash.color = [0, 1, 0]
    expect(flash.color).toEqual([0, 1, 0])
  })

  it('should have independent instances', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const d1 = new Dissolve()
    const d2 = new Dissolve()
    d1.progress = 0.3
    d2.progress = 0.7

    expect(d1.progress).toBe(0.3)
    expect(d2.progress).toBe(0.7)
  })
})

// ============================================
// EffectMaterial.registerEffect — packed buffers
// ============================================

describe('EffectMaterial.registerEffect', () => {
  it('should register effect class and assign slot offsets', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial()
    material.registerEffect(Dissolve)

    expect(material.hasEffect(Dissolve)).toBe(true)
    expect(material._effectBitIndex.get('dissolve')).toBe(0)
    // Slot 0 = flags, slot 1 = dissolve_progress
    expect(material._effectSlots.get('dissolve_progress')).toEqual({ offset: 1, size: 1 })
    expect(material._effectTotalFloats).toBe(2) // 1 flags + 1 data
  })

  it('should assign sequential offsets for multiple effects', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })
    const Flash = createMaterialEffect({
      name: 'flash',
      schema: {
        intensity: 0,
        color: [1, 0, 0],
      },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial()
    material.registerEffect(Dissolve)
    material.registerEffect(Flash)

    const effects = material.getEffects()
    expect(effects).toHaveLength(2)
    expect(effects[0]!.effectName).toBe('dissolve')
    expect(effects[1]!.effectName).toBe('flash')

    // Bit indices
    expect(material._effectBitIndex.get('dissolve')).toBe(0)
    expect(material._effectBitIndex.get('flash')).toBe(1)

    // Slot layout: [flags, dissolve_progress, flash_intensity, flash_color_r, flash_color_g, flash_color_b]
    expect(material._effectSlots.get('dissolve_progress')).toEqual({ offset: 1, size: 1 })
    expect(material._effectSlots.get('flash_intensity')).toEqual({ offset: 2, size: 1 })
    expect(material._effectSlots.get('flash_color')).toEqual({ offset: 3, size: 3 })
    expect(material._effectTotalFloats).toBe(6) // 1 flags + 1 + 1 + 3
  })

  it('should compute correct tier from total floats', () => {
    const Small = createMaterialEffect({
      name: 'small',
      schema: { value: 0 },
      node: ({ inputColor }) => inputColor,
    })

    // Default effectTier is 8, so starting tier is 8
    const material = new Sprite2DMaterial()
    expect(material._effectTier).toBe(8)

    // After registering a small effect (2 floats needed), still tier 8
    material.registerEffect(Small)
    expect(material._effectTier).toBe(8) // max(needed=4, default=8)
  })

  it('should upgrade tier when exceeding capacity', () => {
    const Big = createMaterialEffect({
      name: 'big',
      schema: {
        a: [0, 0, 0, 0],
        b: [0, 0, 0, 0],
      },
      node: ({ inputColor }) => inputColor,
    })

    // Total needed: 1 flags + 4 + 4 = 9 → tier 16
    const material = new Sprite2DMaterial()
    const tierChanged = material.registerEffect(Big)
    expect(tierChanged).toBe(true)
    expect(material._effectTier).toBe(16)
  })

  it('should not change tier when within capacity', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial() // default tier 8
    const tierChanged = material.registerEffect(Dissolve)
    expect(tierChanged).toBe(false) // 2 floats needed, within tier 8
  })

  it('should skip duplicate registration', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial()
    material.registerEffect(Dissolve)
    material.registerEffect(Dissolve) // No-op

    expect(material.getEffects()).toHaveLength(1)
  })

  it('should have effectBuf attributes matching tier', () => {
    const material = new Sprite2DMaterial() // default tier 8 = 2 vec4s

    expect(material.hasInstanceAttribute('effectBuf0')).toBe(true)
    expect(material.hasInstanceAttribute('effectBuf1')).toBe(true)
    expect(material.hasInstanceAttribute('effectBuf2')).toBe(false)

    const config0 = material.getInstanceAttribute('effectBuf0')
    expect(config0).toBeDefined()
    expect(config0!.type).toBe('vec4')
    expect(config0!.defaultValue).toEqual([0, 0, 0, 0])
  })

  it('should have no effectBuf attributes when tier is 0', () => {
    const material = new Sprite2DMaterial({ effectTier: 0 })

    expect(material._effectTier).toBe(0)
    expect(material.hasInstanceAttribute('effectBuf0')).toBe(false)
  })

  it('should increment schema version on tier change', () => {
    const Big = createMaterialEffect({
      name: 'big',
      schema: { a: [0, 0, 0, 0], b: [0, 0, 0, 0] },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial()
    expect(material._effectSchemaVersion).toBe(0)

    material.registerEffect(Big) // causes tier upgrade 8 → 16
    expect(material._effectSchemaVersion).toBe(1)
  })

  it('should clone with effects preserved', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial()
    material.registerEffect(Dissolve)

    const cloned = material.clone()
    const effects = cloned.getEffects()
    expect(effects).toHaveLength(1)
    expect(effects[0]!.effectName).toBe('dissolve')
    expect(cloned.hasEffect(Dissolve)).toBe(true)
    expect(cloned._effectSlots.get('dissolve_progress')).toEqual({ offset: 1, size: 1 })
  })

  it('should rebuild colorNode when texture set after effects', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial()
    material.registerEffect(Dissolve)

    // No colorNode yet (no texture)
    expect(material.colorNode).toBeNull()

    // Setting texture triggers _rebuildColorNode()
    const tex = new Texture()
    material.setTexture(tex)

    // colorNode should now be set (with effect chain)
    expect(material.colorNode).not.toBeNull()
  })
})

// ============================================
// Sprite2D.addEffect — auto-register + packed writes
// ============================================

describe('Sprite2D.addEffect', () => {
  let texture: Texture

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
  })

  it('should auto-register effect on material', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    // Effect NOT registered on material yet
    expect(material.hasEffect(Dissolve)).toBe(false)

    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)

    // Now registered
    expect(material.hasEffect(Dissolve)).toBe(true)
  })

  it('should set enable bit in flags bitmask', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)

    // Bit 0 should be set (dissolve is the first registered effect)
    expect(sprite._effectFlags).toBe(1)

    // Verify flags are written to packed buffer slot 0
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    expect(buf0).toBeDefined()
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(1) // vertex 0, x component = flags = 1
  })

  it('should write effect data to correct packed positions', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.75
    sprite.addEffect(dissolve)

    // Slot 0 = flags (1), slot 1 = dissolve_progress (0.75)
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(1)    // vertex 0, x = flags
    expect(array[1]).toBe(0.75) // vertex 0, y = progress
    // All vertices should have same values
    expect(array[4]).toBe(1)    // vertex 1, x = flags
    expect(array[5]).toBe(0.75) // vertex 1, y = progress
  })

  it('should support vec3 effect values in packed buffer', () => {
    const DamageFlash = createMaterialEffect({
      name: 'damage',
      schema: {
        intensity: 0,
        color: [1, 0, 0],
      },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const flash = new DamageFlash()
    flash.intensity = 0.8
    flash.color = [0, 1, 0]
    sprite.addEffect(flash)

    // Layout: [flags, intensity, color_r, color_g | color_b, ...]
    // Slot 0 = flags, 1 = intensity, 2 = color_r, 3 = color_g
    // effectBuf0 = [flags, intensity, color_r, color_g]
    // effectBuf1 = [color_b, 0, 0, 0]
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array0 = (buf0 as unknown as { array: Float32Array }).array
    expect(array0[0]).toBe(1)          // flags (bit 0 = damage)
    expect(array0[1]).toBeCloseTo(0.8) // intensity (Float32 precision)
    expect(array0[2]).toBe(0)          // color_r
    expect(array0[3]).toBe(1)          // color_g

    const buf1 = sprite.geometry.getAttribute('effectBuf1')
    const array1 = (buf1 as unknown as { array: Float32Array }).array
    expect(array1[0]).toBe(0)   // color_b
  })

  it('should support multiple effects on same sprite', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })
    const Flash = createMaterialEffect({
      name: 'flash',
      schema: { intensity: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)

    const flash = new Flash()
    flash.intensity = 0.8
    sprite.addEffect(flash)

    // Flags: bit 0 (dissolve) + bit 1 (flash) = 3
    expect(sprite._effectFlags).toBe(3)

    // Layout: [flags=3, dissolve_progress=0.5, flash_intensity=0.8, ...]
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(3)   // flags
    expect(array[1]).toBe(0.5) // dissolve progress
    expect(array[2]).toBeCloseTo(0.8) // flash intensity (Float32 precision)
  })

  it('should update packed data when effect property changes', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Dissolve)

    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)

    // Update progress after adding
    dissolve.progress = 0.9

    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[1]).toBeCloseTo(0.9) // updated progress
  })

  it('should share packed layout between sprites with same material', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Dissolve)

    const sprite1 = new Sprite2D({ texture, material })
    const sprite2 = new Sprite2D({ texture, material })

    const d1 = new Dissolve()
    d1.progress = 0.3
    sprite1.addEffect(d1)

    const d2 = new Dissolve()
    d2.progress = 0.7
    sprite2.addEffect(d2)

    // Both sprites write to same slot layout
    const array1 = (sprite1.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array
    const array2 = (sprite2.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array

    expect(array1[1]).toBeCloseTo(0.3) // sprite1 progress (Float32 precision)
    expect(array2[1]).toBeCloseTo(0.7) // sprite2 progress (Float32 precision)
  })
})

// ============================================
// Sprite2D.removeEffect
// ============================================

describe('Sprite2D.removeEffect', () => {
  let texture: Texture

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
  })

  it('should clear enable bit in flags', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)
    expect(sprite._effectFlags).toBe(1)

    sprite.removeEffect(dissolve)
    expect(sprite._effectFlags).toBe(0)
  })

  it('should reset data slots to defaults', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.75
    sprite.addEffect(dissolve)
    sprite.removeEffect(dissolve)

    // Packed buffer should reflect the reset
    const array = (sprite.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(0) // flags = 0 (disabled)
    expect(array[1]).toBe(0) // progress = 0 (default)
  })

  it('should not affect other effects', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })
    const Flash = createMaterialEffect({
      name: 'flash',
      schema: { intensity: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)

    const flash = new Flash()
    flash.intensity = 0.8
    sprite.addEffect(flash)

    sprite.removeEffect(dissolve)

    // Flash should still be enabled (bit 1)
    expect(sprite._effectFlags).toBe(2) // only bit 1

    const array = (sprite.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(2)   // flags: only flash enabled
    expect(array[1]).toBe(0)   // dissolve progress: reset to default
    expect(array[2]).toBeCloseTo(0.8) // flash intensity: unchanged (Float32 precision)
  })

  it('should be no-op for unregistered effect', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()

    // Should not throw
    sprite.removeEffect(dissolve)
    expect(sprite._effectFlags).toBe(0)
  })
})

// ============================================
// Enable flags bitmask
// ============================================

describe('Enable flags bitmask', () => {
  let texture: Texture

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
  })

  it('should pack all flags in a single float', () => {
    const effects = Array.from({ length: 5 }, (_, i) =>
      createMaterialEffect({
        name: `effect${i}`,
        schema: { value: 0 },
        node: ({ inputColor }) => inputColor,
      })
    )

    const material = new Sprite2DMaterial({ map: texture, effectTier: 16 })
    const sprite = new Sprite2D({ texture, material })

    // Enable all 5 effects
    for (const EffectClass of effects) {
      const instance = new EffectClass()
      ;(instance as any).value = 1
      sprite.addEffect(instance)
    }

    // flags = 0b11111 = 31
    expect(sprite._effectFlags).toBe(31)

    const array = (sprite.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(31) // all 5 bits set in one float
  })

  it('should support selective enable/disable', () => {
    const A = createMaterialEffect({ name: 'a', schema: { v: 0 }, node: ({ inputColor }) => inputColor })
    const B = createMaterialEffect({ name: 'b', schema: { v: 0 }, node: ({ inputColor }) => inputColor })
    const C = createMaterialEffect({ name: 'c', schema: { v: 0 }, node: ({ inputColor }) => inputColor })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    const a = new A()
    ;(a as any).v = 1
    const b = new B()
    ;(b as any).v = 1
    const c = new C()
    ;(c as any).v = 1

    sprite.addEffect(a)
    sprite.addEffect(b)
    sprite.addEffect(c)
    expect(sprite._effectFlags).toBe(7) // 0b111

    sprite.removeEffect(b)
    expect(sprite._effectFlags).toBe(5) // 0b101

    sprite.removeEffect(a)
    expect(sprite._effectFlags).toBe(4) // 0b100

    // Re-add a — creates new instance since the old was detached
    const a2 = new A()
    ;(a2 as any).v = 1
    sprite.addEffect(a2)
    expect(sprite._effectFlags).toBe(5) // 0b101
  })
})

// ============================================
// Snapshot pattern — effects work before/after enrollment
// ============================================

describe('Snapshot pattern', () => {
  it('should stage effect values before enrollment', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const dissolve = new Dissolve()
    dissolve.progress = 0.5

    // Before attaching to sprite, values are in snapshot
    expect(dissolve.progress).toBe(0.5)
    expect(dissolve._defaults['progress']).toBe(0.5)
  })
})

// ============================================
// _setField: trait-only writes for enrolled sprites
// ============================================

describe('_setField ECS integration', () => {
  // Create effect classes at describe level so traits survive universe.reset()
  const DissolveEnrolled = createMaterialEffect({
    name: 'dissolve_enrolled',
    schema: { progress: 0 },
    node: ({ inputColor }) => inputColor,
  })
  const DissolveStandalone = createMaterialEffect({
    name: 'dissolve_standalone',
    schema: { progress: 0 },
    node: ({ inputColor }) => inputColor,
  })

  let texture: Texture

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
  })

  it('on enrolled sprite: writes trait, no buffer sync', () => {
    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new DissolveEnrolled()
    sprite.addEffect(dissolve)

    // Enroll in world
    const world = createWorld()
    sprite._enrollInWorld(world)

    // Get initial own buffer value
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    const initialValue = array[1] // progress slot

    // Change progress — should write to trait only, NOT to own buffer
    dissolve.progress = 0.9

    // Own buffer should NOT have changed
    expect(array[1]).toBe(initialValue)

    // But reading progress should return new value (from trait)
    expect(dissolve.progress).toBeCloseTo(0.9)

    world.destroy()
  })

  it('on standalone sprite: writes snapshot + own buffer', () => {
    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new DissolveStandalone()
    sprite.addEffect(dissolve)

    // No enrollment — standalone
    dissolve.progress = 0.9

    // Own buffer SHOULD be updated (standalone path)
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[1]).toBeCloseTo(0.9)
  })
})

// ============================================
// Clone
// ============================================

describe('Sprite2D clone with effects', () => {
  it('should clone effect instances', () => {
    const texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }

    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.7
    sprite.addEffect(dissolve)

    const cloned = sprite.clone()
    expect(cloned._effects).toHaveLength(1)
    expect(cloned._effectFlags).toBe(1)

    // Cloned effect should be independent
    const clonedDissolve = cloned._effects[0]!
    expect(clonedDissolve).not.toBe(dissolve)
    expect(clonedDissolve.name).toBe('dissolve')
    expect((clonedDissolve as any).progress).toBeCloseTo(0.7)
  })
})

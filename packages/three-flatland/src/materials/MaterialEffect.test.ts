import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Texture } from 'three'
import { createWorld, universe } from 'koota'
import { MaterialEffect, createMaterialEffect } from './MaterialEffect'
import type { EffectNodeContext } from './MaterialEffect'
import { Sprite2DMaterial } from './Sprite2DMaterial'
import { Sprite2D, LIT_FLAG_MASK, RECEIVE_SHADOWS_MASK, EFFECT_BIT_OFFSET } from '../sprites/Sprite2D'

// Default low bits (lit + receiveShadows) that are always set on new Sprite2D instances.
const DEFAULT_FLAGS = LIT_FLAG_MASK | RECEIVE_SHADOWS_MASK

// MaterialEffect enable bits are assigned starting at EFFECT_BIT_OFFSET.
// Express per-effect masks in terms of the offset so a future bump of the
// system-flag count doesn't require a mass rewrite of expected values.
const E = (i: number): number => 1 << (EFFECT_BIT_OFFSET + i)
const E0 = E(0) // first registered effect
const E1 = E(1) // second
const E2 = E(2) // third
const E3 = E(3) // fourth
const E4 = E(4) // fifth

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
    expect(material._effectBitIndex.get('dissolve')).toBe(EFFECT_BIT_OFFSET)
    // Slots 0+1 reserved (system flags, enable bits); effect data starts at slot 2.
    expect(material._effectSlots.get('dissolve_progress')).toEqual({ offset: 2, size: 1 })
    expect(material._effectTotalFloats).toBe(3) // 2 reserved + 1 data
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

    // Bit indices (offset past system flags at bits 0-1)
    expect(material._effectBitIndex.get('dissolve')).toBe(EFFECT_BIT_OFFSET)
    expect(material._effectBitIndex.get('flash')).toBe(EFFECT_BIT_OFFSET + 1)

    // Slot layout:
    //   0 = system flags (effectBuf0.x)
    //   1 = enable bits  (effectBuf0.y)
    //   2 = dissolve_progress (effectBuf0.z)
    //   3 = flash_intensity   (effectBuf0.w)
    //   4..6 = flash_color    (effectBuf1.x..z)
    expect(material._effectSlots.get('dissolve_progress')).toEqual({ offset: 2, size: 1 })
    expect(material._effectSlots.get('flash_intensity')).toEqual({ offset: 3, size: 1 })
    expect(material._effectSlots.get('flash_color')).toEqual({ offset: 4, size: 3 })
    expect(material._effectTotalFloats).toBe(7) // 2 reserved + 1 + 1 + 3
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
    expect(cloned._effectSlots.get('dissolve_progress')).toEqual({ offset: 2, size: 1 })
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

    // System flags untouched; enable bits pick up the first registered effect at bit 0.
    expect(sprite._effectFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectEnableBits).toBe(E0)

    // Verify the packed buffer carries both words — x = system flags, y = enable bits.
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    expect(buf0).toBeDefined()
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(DEFAULT_FLAGS) // vertex 0, x = system flags
    expect(array[1]).toBe(E0)            // vertex 0, y = enable bits
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

    // Slot layout: 0 = system flags, 1 = enable bits, 2 = dissolve_progress.
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(DEFAULT_FLAGS) // v0.x = system flags
    expect(array[1]).toBe(E0)            // v0.y = enable bits
    expect(array[2]).toBe(0.75)          // v0.z = progress
    // All vertices should have the same values.
    expect(array[4]).toBe(DEFAULT_FLAGS) // v1.x
    expect(array[5]).toBe(E0)            // v1.y
    expect(array[6]).toBe(0.75)          // v1.z
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

    // New layout with reserved slots 0+1:
    //   effectBuf0 = [system_flags, enable_bits, intensity, color_r]
    //   effectBuf1 = [color_g, color_b, 0, 0]
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array0 = (buf0 as unknown as { array: Float32Array }).array
    expect(array0[0]).toBe(DEFAULT_FLAGS)   // system flags
    expect(array0[1]).toBe(E0)              // enable bits
    expect(array0[2]).toBeCloseTo(0.8)      // intensity (Float32 precision)
    expect(array0[3]).toBe(0)               // color_r

    const buf1 = sprite.geometry.getAttribute('effectBuf1')
    const array1 = (buf1 as unknown as { array: Float32Array }).array
    expect(array1[0]).toBe(1)  // color_g
    expect(array1[1]).toBe(0)  // color_b
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

    // Both enable bits set; system flags untouched.
    expect(sprite._effectFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectEnableBits).toBe(E0 | E1)

    // Layout: [system_flags, enable_bits, dissolve_progress, flash_intensity, …]
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(DEFAULT_FLAGS)
    expect(array[1]).toBe(E0 | E1)
    expect(array[2]).toBe(0.5) // dissolve progress
    expect(array[3]).toBeCloseTo(0.8) // flash intensity (Float32 precision)
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
    expect(array[2]).toBeCloseTo(0.9) // updated progress (slot 2 after reserved 0+1)
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

    expect(array1[2]).toBeCloseTo(0.3) // sprite1 progress (slot 2)
    expect(array2[2]).toBeCloseTo(0.7) // sprite2 progress (slot 2)
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
    expect(sprite._effectFlags).toBe(DEFAULT_FLAGS) // system flags untouched
    expect(sprite._effectEnableBits).toBe(E0)

    sprite.removeEffect(dissolve)
    expect(sprite._effectFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectEnableBits).toBe(0)
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
    expect(array[0]).toBe(DEFAULT_FLAGS) // system flags (unchanged)
    expect(array[1]).toBe(0)             // enable bits (cleared)
    expect(array[2]).toBe(0)             // progress (reset to default)
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

    // Flash remains enabled.
    expect(sprite._effectFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectEnableBits).toBe(E1)

    const array = (sprite.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(DEFAULT_FLAGS)  // system flags
    expect(array[1]).toBe(E1)             // enable bits: only flash
    expect(array[2]).toBe(0)              // dissolve progress: reset to default
    expect(array[3]).toBeCloseTo(0.8)     // flash intensity: unchanged
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
    expect(sprite._effectFlags).toBe(DEFAULT_FLAGS)
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

    // Enable bits 0..4 set (one per registered effect); system flags untouched.
    expect(sprite._effectFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectEnableBits).toBe(E0 | E1 | E2 | E3 | E4)

    const array = (sprite.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(DEFAULT_FLAGS)                        // system flags in x
    expect(array[1]).toBe(E0 | E1 | E2 | E3 | E4)               // enable bits in y
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
    expect(sprite._effectEnableBits).toBe(E0 | E1 | E2)

    sprite.removeEffect(b)
    expect(sprite._effectEnableBits).toBe(E0 | E2)

    sprite.removeEffect(a)
    expect(sprite._effectEnableBits).toBe(E2)

    // Re-add a — creates new instance since the old was detached
    const a2 = new A()
    ;(a2 as any).v = 1
    sprite.addEffect(a2)
    expect(sprite._effectEnableBits).toBe(E0 | E2)
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
    const initialValue = array[2] // progress lives at slot 2 (after system flags + enable bits)

    // Change progress — should write to trait only, NOT to own buffer
    dissolve.progress = 0.9

    // Own buffer should NOT have changed
    expect(array[2]).toBe(initialValue)

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
    expect(array[2]).toBeCloseTo(0.9) // progress slot 2
  })
})

// ============================================
// Clone
// ============================================

// ============================================
// R3F declarative attach: effect setter
// ============================================

// ============================================
// addEffect for already-enrolled sprites (Changed trigger)
// ============================================

describe('addEffect triggers Changed for enrolled sprites', () => {
  const DissolveChanged = createMaterialEffect({
    name: 'dissolve_changed',
    schema: { progress: 0 },
    node: ({ inputColor }) => inputColor,
  })

  let texture: Texture

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
  })

  it('should trigger Changed when adding effect to enrolled sprite', () => {
    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    // Enroll first, then add effect (simulates conditional rendering)
    const world = createWorld()
    sprite._enrollInWorld(world)

    const dissolve = new DissolveChanged()
    dissolve.progress = 0.6
    sprite.addEffect(dissolve)

    // Trait should exist with correct value
    expect(sprite.entity!.has(DissolveChanged._trait)).toBe(true)
    const traitData = sprite.entity!.get(DissolveChanged._trait) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.6)

    world.destroy()
  })

  it('should preserve defaults when adding to enrolled sprite', () => {
    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    // Enroll first
    const world = createWorld()
    sprite._enrollInWorld(world)

    // Create effect, set props, then add (simulates R3F applyProps before attach)
    const dissolve = new DissolveChanged()
    dissolve.progress = 0.42

    sprite.addEffect(dissolve)

    // Trait should have value from _defaults (set before attachment)
    const traitData = sprite.entity!.get(DissolveChanged._trait) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.42)

    world.destroy()
  })
})

// ============================================
// addEffect / removeEffect / addEffect cycle
// (R3F detach→reattach pattern)
// ============================================

describe('Effect remove + add cycle', () => {
  const DissolveRA = createMaterialEffect({
    name: 'dissolve_ra',
    schema: { progress: 0 },
    node: ({ inputColor }) => inputColor,
  })

  let texture: Texture

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
  })

  afterEach(() => {
    universe.reset()
  })

  it('standalone: removeEffect + addEffect cycle preserves functionality', () => {
    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    const d1 = new DissolveRA()
    d1.progress = 0.5
    sprite.addEffect(d1)

    // Remove effect
    sprite.removeEffect(d1)

    // Re-add new instance of same type
    const d2 = new DissolveRA()
    d2.progress = 0.8
    sprite.addEffect(d2)

    // New effect should be functional
    expect(sprite._effects).toHaveLength(1)
    expect(sprite._effects[0]).toBe(d2)
    expect(sprite._effectFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectEnableBits).toBe(E0)

    // Property updates should write to own buffer
    d2.progress = 0.9
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[2]).toBeCloseTo(0.9) // progress lives at slot 2
  })

  it('enrolled: removeEffect + addEffect cycle preserves trait functionality', () => {
    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    const d1 = new DissolveRA()
    d1.progress = 0.3
    sprite.addEffect(d1)

    // Enroll
    const world = createWorld()
    sprite._enrollInWorld(world)

    // Verify initial state
    expect(sprite.entity!.has(DissolveRA._trait)).toBe(true)

    // Simulate R3F detach
    sprite.removeEffect(d1)

    expect(sprite.entity!.has(DissolveRA._trait)).toBe(false)
    expect(d1._entity).toBeNull()
    expect(d1._sprite).toBeNull()

    // Simulate R3F attach with new instance
    const d2 = new DissolveRA()
    d2.progress = 0.8
    sprite.addEffect(d2)

    // New effect should be attached with correct entity
    expect(d2._sprite).toBe(sprite)
    expect(d2._entity).toBe(sprite.entity)
    expect(sprite.entity!.has(DissolveRA._trait)).toBe(true)

    // Property updates should write to trait (enrolled path)
    d2.progress = 0.95
    const traitData = sprite.entity!.get(DissolveRA._trait) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.95)

    world.destroy()
  })

  it('enrolled: property updates work after removeEffect + addEffect cycle', () => {
    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    const d1 = new DissolveRA()
    d1.progress = 0.3
    sprite.addEffect(d1)

    // Enroll (simulates spriteGroup.add)
    const world = createWorld()
    sprite._enrollInWorld(world)

    // Verify enrolled state
    expect(sprite.entity!.has(DissolveRA._trait)).toBe(true)

    // Remove and re-add
    sprite.removeEffect(d1)
    const d2 = new DissolveRA()
    d2.progress = 0.7
    sprite.addEffect(d2)

    // The critical test: can we update progress on the new instance?
    d2.progress = 0.85
    const traitData = sprite.entity!.get(DissolveRA._trait) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.85)

    // And does _effects contain the new instance?
    expect(sprite._effects.find(e => e.name === 'dissolve_ra')).toBe(d2)

    world.destroy()
  })

  it('enrolled: effect ref functional after multiple cycles', () => {
    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    // Enroll first, then add effect (like conditional rendering)
    const world = createWorld()
    sprite._enrollInWorld(world)

    // Cycle 1
    const d1 = new DissolveRA()
    d1.progress = 0.1
    sprite.addEffect(d1)
    expect(sprite._effects.find(e => e.name === 'dissolve_ra')).toBe(d1)

    sprite.removeEffect(d1)
    expect(sprite._effects.find(e => e.name === 'dissolve_ra')).toBeUndefined()

    // Cycle 2
    const d2 = new DissolveRA()
    d2.progress = 0.5
    sprite.addEffect(d2)
    expect(sprite._effects.find(e => e.name === 'dissolve_ra')).toBe(d2)

    // Update directly on effect ref — the actual game pattern
    d2.progress = 0.75
    const traitData = sprite.entity!.get(DissolveRA._trait) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.75)

    world.destroy()
  })

  it('enrolled: effect flags correct after remove + add cycle', () => {
    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })

    const world = createWorld()
    sprite._enrollInWorld(world)

    const d1 = new DissolveRA()
    sprite.addEffect(d1)
    expect(sprite._effectEnableBits).toBe(E0)

    sprite.removeEffect(d1)
    expect(sprite._effectEnableBits).toBe(0)

    const d2 = new DissolveRA()
    sprite.addEffect(d2)
    expect(sprite._effectEnableBits).toBe(E0)

    world.destroy()
  })
})

describe('Sprite2D.dispose does not dispose shared material', () => {
  let texture: Texture

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
  })

  it('sprite dispose does not clear material effects', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve_disp',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Dissolve)

    const s1 = new Sprite2D({ texture, material })
    const s2 = new Sprite2D({ texture, material })

    // Dispose one sprite — material must remain intact
    s1.dispose()
    expect(material.getEffects()).toHaveLength(1)
    expect(material.getEffects()[0]!.effectName).toBe('dissolve_disp')

    // Dispose second sprite — material still intact
    s2.dispose()
    expect(material.getEffects()).toHaveLength(1)
  })

  it('explicit material.dispose() clears effects', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve_disp2',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Dissolve)
    expect(material.getEffects()).toHaveLength(1)

    material.dispose()
    expect(material.getEffects()).toHaveLength(0)
  })

  it('sprite dispose cleans up own geometry and effects', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve_disp3',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    sprite.addEffect(dissolve)

    expect(sprite._effects).toHaveLength(1)
    sprite.dispose()
    expect(sprite._effects).toHaveLength(0)
    expect(dissolve._sprite).toBeNull()
  })
})

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
    expect(cloned._effectFlags).toBe(DEFAULT_FLAGS)
    expect(cloned._effectEnableBits).toBe(E0)

    // Cloned effect should be independent
    const clonedDissolve = cloned._effects[0]!
    expect(clonedDissolve).not.toBe(dissolve)
    expect(clonedDissolve.name).toBe('dissolve')
    expect((clonedDissolve as any).progress).toBeCloseTo(0.7)
  })
})

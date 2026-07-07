import { describe, it, expect } from 'vitest'
import { LightEffect, createLightEffect } from './LightEffect'
import type { LightEffectBuildContext } from './LightEffect'
import type { ColorTransformFn } from '../materials/Sprite2DMaterial'
import type Node from 'three/src/nodes/core/Node.js'

// Stub ColorTransformFn for tests
const stubLightFn: ColorTransformFn = (ctx) => ctx.color

// ============================================
// createLightEffect — factory API
// ============================================

describe('createLightEffect', () => {
  it('should create a class with correct lightName and schema', () => {
    const Simple = createLightEffect({
      name: 'defaultLight',
      schema: { ambientIntensity: 0.2 },
      light: () => stubLightFn,
    })

    expect(Simple.lightName).toBe('defaultLight')
    expect(Simple.lightSchema.ambientIntensity).toBe(0.2)
  })

  it('should auto-create a Koota trait from schema', () => {
    const Simple = createLightEffect({
      name: 'simpleTrait',
      schema: { ambientIntensity: 0.2 },
      light: () => stubLightFn,
    })

    Simple._initialize()
    expect(typeof Simple._trait).toBe('function')
  })

  it('should compute field metadata from schema', () => {
    const Effect = createLightEffect({
      name: 'fieldMeta',
      schema: { intensity: 1.0, color: [1, 0, 0] },
      light: () => stubLightFn,
    })

    Effect._initialize()
    expect(Effect._fields).toHaveLength(2)
    expect(Effect._fields[0]!.name).toBe('intensity')
    expect(Effect._fields[0]!.size).toBe(1)
    expect(Effect._fields[0]!.default).toEqual([1.0])
    expect(Effect._fields[1]!.name).toBe('color')
    expect(Effect._fields[1]!.size).toBe(3)
    expect(Effect._fields[1]!.default).toEqual([1, 0, 0])
    expect(Effect._totalFloats).toBe(4)
  })

  it('should set needsShadows from config', () => {
    const NoShadows = createLightEffect({
      name: 'noShadow',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const WithShadows = createLightEffect({
      name: 'withShadow',
      schema: { value: 0 },
      needsShadows: true,
      light: () => stubLightFn,
    })

    expect(NoShadows.needsShadows).toBe(false)
    expect(WithShadows.needsShadows).toBe(true)
  })
})

// ============================================
// Class-based LightEffect definition
// ============================================

describe('class-based LightEffect', () => {
  it('should work with static fields and buildLightFn', () => {
    class TestLightEffect extends LightEffect {
      static readonly lightName = 'testLight'
      static readonly lightSchema = { brightness: 1.0 } as const
      declare brightness: number

      static override buildLightFn(_ctx: LightEffectBuildContext): ColorTransformFn {
        return stubLightFn
      }
    }

    const effect = new TestLightEffect()
    expect(effect.name).toBe('testLight')
    expect(effect.brightness).toBe(1.0)
  })

  it('should support needsShadows override', () => {
    class ShadowEffect extends LightEffect {
      static readonly lightName = 'shadowTest'
      static readonly lightSchema = { strength: 0.5 } as const
      static override readonly needsShadows = true

      static override buildLightFn(): ColorTransformFn {
        return stubLightFn
      }
    }

    expect(ShadowEffect.needsShadows).toBe(true)
  })
})

// ============================================
// LightEffect instances — property accessors
// ============================================

describe('LightEffect instances', () => {
  it('should construct with default values', () => {
    const Effect = createLightEffect({
      name: 'defaultTest',
      schema: { brightness: 0.5 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    expect(instance.brightness).toBe(0.5)
  })

  it('should set properties via setters', () => {
    const Effect = createLightEffect({
      name: 'setterTest',
      schema: { brightness: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    instance.brightness = 0.8
    expect(instance.brightness).toBe(0.8)
  })

  it('should support vec3 field defaults and setters', () => {
    const Effect = createLightEffect({
      name: 'vec3Test',
      schema: { tint: [1, 0, 0] },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    expect(instance.tint).toEqual([1, 0, 0])

    instance.tint = [0, 1, 0]
    expect(instance.tint).toEqual([0, 1, 0])
  })

  it('should have independent instances', () => {
    const Effect = createLightEffect({
      name: 'independentTest',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const a = new Effect()
    const b = new Effect()
    a.value = 0.3
    b.value = 0.7

    expect(a.value).toBe(0.3)
    expect(b.value).toBe(0.7)
  })

  it('should have an enabled property that defaults to true', () => {
    const Effect = createLightEffect({
      name: 'enabledTest',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    expect(instance.enabled).toBe(true)

    instance.enabled = false
    expect(instance.enabled).toBe(false)
  })
})

// ============================================
// Lifecycle methods
// ============================================

describe('LightEffect lifecycle', () => {
  it('should have no-op default lifecycle methods', () => {
    const Effect = createLightEffect({
      name: 'lifecycleTest',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()

    // These should not throw
    instance.init({} as any)
    instance.update({} as any)
    instance.resize(800, 600)
    instance.dispose()
  })

  it('should track _initialized state', () => {
    const Effect = createLightEffect({
      name: 'initTrack',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    expect(instance._initialized).toBe(false)
  })

  it('should reset _initialized on detach', () => {
    const Effect = createLightEffect({
      name: 'detachReset',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    instance._initialized = true
    instance._detach()
    expect(instance._initialized).toBe(false)
  })
})

// ============================================
// Attach/detach
// ============================================

describe('LightEffect attach/detach', () => {
  it('should attach to a flatland-like object', () => {
    const Effect = createLightEffect({
      name: 'attachTest',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    const mockFlatland = { _markLightingDirty: () => {} }

    instance._attach(mockFlatland)
    expect(instance._flatland).toBe(mockFlatland)
  })

  it('should detach and clear references', () => {
    const Effect = createLightEffect({
      name: 'detachTest',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    const mockFlatland = { _markLightingDirty: () => {} }

    instance._attach(mockFlatland)
    instance._detach()

    expect(instance._flatland).toBeNull()
    expect(instance._entity).toBeNull()
    expect(instance._lightFn).toBeNull()
  })

  it('should call _markLightingDirty when enabled changes', () => {
    const Effect = createLightEffect({
      name: 'dirtyTest',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    let dirtyCalled = false
    const mockFlatland = { _markLightingDirty: () => { dirtyCalled = true } }

    instance._attach(mockFlatland)
    instance.enabled = false
    expect(dirtyCalled).toBe(true)
  })
})

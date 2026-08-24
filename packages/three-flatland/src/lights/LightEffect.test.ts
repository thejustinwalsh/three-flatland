import { entityFor, traitFor } from '../ecs/testUtils.type-test'
import { createWorld } from '../ecs/runtime'
import { registerSpriteGroupRuntime } from '../internal/sprite-group-runtime'
import { describe, it, expect, vi } from 'vitest'
import { LightEffect, createLightEffect } from './LightEffect'
import type { LightEffectBuildContext } from './LightEffect'
import type { ColorTransformFn } from '../materials/Sprite2DMaterial'
import type { SpriteGroup } from '../pipeline/SpriteGroup'
import type Node from 'three/src/nodes/core/Node.js'

// Stub ColorTransformFn for tests
const stubLightFn: ColorTransformFn = (ctx) => ctx.color

// ============================================
// createLightEffect — factory API
// ============================================

describe('createLightEffect', () => {
  it('rejects reserved and flattened-collision schema keys atomically', () => {
    const make = (name: string, schema: Record<string, unknown>) =>
      createLightEffect({ name, schema: schema as never, light: () => stubLightFn })
    const Effects = [
      make('light_reserved_constructor', { constructor: 1 }),
      make('light_reserved_own', { name: 1 }),
      make('light_reserved_method', { update: 1 }),
      make('light_flattened_collision', { vector: [0, 0], vector_0: 1 }),
      make('light_invalid_non_array', { value: 'invalid' }),
      make('light_invalid_vec1', { value: [1] }),
      make('light_invalid_vec5', { value: [1, 2, 3, 4, 5] }),
      make('light_invalid_component', { value: [1, 'invalid'] }),
      make('light_invalid_scalar', { value: Number.POSITIVE_INFINITY }),
    ]

    for (const Effect of Effects) {
      expect(() => new Effect()).toThrow(/conflicts|flatten|numeric tuple|finite/)
      expect(Effect._initialized).toBe(false)
    }
  })

  it('rejects schema accessors and initializes from one cloned descriptor snapshot', () => {
    let getterReads = 0
    const accessorSchema = Object.defineProperty({}, 'vector', {
      enumerable: true,
      get() {
        getterReads++
        return [1, 2]
      },
    })
    const AccessorEffect = createLightEffect({
      name: 'light_accessor_schema',
      schema: accessorSchema as never,
      light: () => stubLightFn,
    })
    expect(() => new AccessorEffect()).toThrow(/own data property; accessors are not supported/)
    expect(getterReads).toBe(0)
    expect(AccessorEffect._initialized).toBe(false)

    let descriptorReads = 0
    const proxySchema = new Proxy(
      { vector: [1, 2] },
      {
        getOwnPropertyDescriptor(target, property) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, property)!
          descriptorReads++
          return { ...descriptor, value: descriptorReads === 1 ? [1, 2] : [1, 2, 3, 4, 5] }
        },
      }
    )
    const SnapshotEffect = createLightEffect({
      name: 'light_snapshot_schema',
      schema: proxySchema as never,
      light: () => stubLightFn,
    })
    const snapshot = new SnapshotEffect()
    expect(descriptorReads).toBe(1)
    expect(SnapshotEffect._fields).toEqual([{ name: 'vector', size: 2, default: [1, 2] }])
    expect(snapshot.vector).toEqual([1, 2])
  })

  it('uses null-prototype records for valid metadata, snapshots, constants, and uniforms', () => {
    const Effect = createLightEffect({
      name: 'light_null_proto_records',
      schema: { constructor_value: 1, toString_value: () => 7 },
      light: () => stubLightFn,
    })
    const effect = new Effect()

    expect(Object.getPrototypeOf(Effect._fieldKeys)).toBeNull()
    expect(Object.getPrototypeOf(Effect._constantFactories)).toBeNull()
    expect(Object.getPrototypeOf(effect._defaults)).toBeNull()
    expect(Object.getPrototypeOf(effect._constants)).toBeNull()
    expect(Object.getPrototypeOf(effect._uniforms)).toBeNull()
    effect.constructor_value = 9
    expect(effect.constructor_value).toBe(9)
    expect(effect.toString_value).toBe(7)
  })

  it('should create a class with correct lightName and schema', () => {
    const Simple = createLightEffect({
      name: 'defaultLight',
      schema: { ambientIntensity: 0.2 },
      light: () => stubLightFn,
    })

    expect(Simple.lightName).toBe('defaultLight')
    expect(Simple.lightSchema.ambientIntensity).toBe(0.2)
  })

  it('should auto-create a numeric ECS trait from schema', () => {
    const Simple = createLightEffect({
      name: 'simpleTrait',
      schema: { ambientIntensity: 0.2 },
      light: () => stubLightFn,
    })

    Simple._initialize()
    expect(typeof traitFor(Simple)).toBe('function')
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
    expect(Object.getOwnPropertyDescriptor(effect, 'brightness')?.configurable).toBe(false)
  })

  it('rejects emitted subclass fields that would shadow uniform or constant accessors', () => {
    class UniformShadow extends LightEffect {
      static readonly lightName = 'light_uniform_shadow'
      static readonly lightSchema = { intensity: 0 } as const
      intensity = 1
      static override buildLightFn(): ColorTransformFn {
        return stubLightFn
      }
    }
    class ConstantShadow extends LightEffect {
      static readonly lightName = 'light_constant_shadow'
      static readonly lightSchema = { mode: () => 'base' } as const
      mode = 'field'
      static override buildLightFn(): ColorTransformFn {
        return stubLightFn
      }
    }

    expect(() => new UniformShadow()).toThrow(/Cannot redefine property: intensity/)
    expect(() => new ConstantShadow()).toThrow(/Cannot redefine property: mode/)
  })

  it('initializes independent metadata for second-level subclasses', () => {
    class ParentEffect extends LightEffect {
      static readonly lightName = 'parent_light_effect'
      static readonly lightSchema: typeof LightEffect.lightSchema = { parentValue: 1 }
      declare parentValue: number
      static override buildLightFn(): ColorTransformFn {
        return stubLightFn
      }
    }
    class ChildEffect extends ParentEffect {
      static override readonly lightName = 'child_light_effect'
      static override readonly lightSchema: typeof LightEffect.lightSchema = { childValue: 2 }
      declare childValue: number
      static override buildLightFn(): ColorTransformFn {
        return stubLightFn
      }
    }

    const parent = new ParentEffect()
    const child = new ChildEffect()

    expect(parent.parentValue).toBe(1)
    expect(child.childValue).toBe(2)
    expect(ParentEffect._fields.map(({ name }) => name)).toEqual(['parentValue'])
    expect(ChildEffect._fields.map(({ name }) => name)).toEqual(['childValue'])
    expect(Object.hasOwn(ChildEffect, '_initialized')).toBe(true)
    expect(traitFor(ChildEffect)).not.toBe(traitFor(ParentEffect))
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
    const baseClass: typeof LightEffect = Effect
    expect(baseClass._fieldKeys.tint).toEqual(['tint_0', 'tint_1', 'tint_2'])
    expect(baseClass._fieldMap.get('tint')?.size).toBe(3)
    const initial = instance.tint
    expect(initial).toEqual([1, 0, 0])
    expect(instance.tint).toBe(initial)
    expect(Object.isFrozen(initial)).toBe(true)
    expect(() => {
      ;(initial as unknown as number[])[0] = 9
    }).toThrow(TypeError)
    expect(instance.tint).toEqual([1, 0, 0])

    instance.tint = [0, 1, 0]
    const updated = instance.tint
    expect(updated).toEqual([0, 1, 0])
    expect(updated).not.toBe(initial)
    expect(instance.tint).toBe(updated)
    expect(initial).toEqual([1, 0, 0])

    instance.tint = [0, 1, 0]
    expect(instance.tint).toBe(updated)

    expect(() => instance._setField('tint', [1, 2, 3, 4])).toThrow(/3 numeric components/)
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

  it('should not report a runtime rebuild when constants are assigned before the shader is built', () => {
    const Effect = createLightEffect({
      name: 'constantBeforeBuild',
      schema: { featureEnabled: () => false },
      light: () => stubLightFn,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const instance = new Effect()
      instance.featureEnabled = true
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('should report a runtime rebuild after a constant has been captured by the shader', () => {
    const Effect = createLightEffect({
      name: 'constantAfterBuild',
      schema: { featureEnabled: () => false },
      light: () => stubLightFn,
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const instance = new Effect()
      instance._buildLightFn(null as never, null as never, null as never, null)
      instance.featureEnabled = true
      expect(warn).toHaveBeenCalledOnce()
      expect(warn).toHaveBeenCalledWith(
        '[three-flatland] constantAfterBuild.featureEnabled changed at runtime — triggers shader rebuild'
      )
    } finally {
      warn.mockRestore()
    }
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
    const world = createWorld()
    const spriteGroup = {} as SpriteGroup
    registerSpriteGroupRuntime(spriteGroup, () => world)
    const mockFlatland = { spriteGroup, _markLightingDirty: () => {} }

    instance._attach(mockFlatland)
    expect(instance._flatland).toBe(mockFlatland)
    world.dispose()
  })

  it('should detach and clear references', () => {
    const Effect = createLightEffect({
      name: 'detachTest',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    const world = createWorld()
    const spriteGroup = {} as SpriteGroup
    registerSpriteGroupRuntime(spriteGroup, () => world)
    const mockFlatland = { spriteGroup, _markLightingDirty: () => {} }

    instance._attach(mockFlatland)
    instance._detach()

    expect(instance._flatland).toBeNull()
    expect(entityFor(instance)).toBeNull()
    expect(instance._lightFn).toBeNull()
    world.dispose()
  })

  it('should call _markLightingDirty when enabled changes', () => {
    const Effect = createLightEffect({
      name: 'dirtyTest',
      schema: { value: 0 },
      light: () => stubLightFn,
    })

    const instance = new Effect()
    let dirtyCalled = false
    const world = createWorld()
    const spriteGroup = {} as SpriteGroup
    registerSpriteGroupRuntime(spriteGroup, () => world)
    const mockFlatland = {
      spriteGroup,
      _markLightingDirty: () => {
        dirtyCalled = true
      },
    }

    instance._attach(mockFlatland)
    instance.enabled = false
    expect(dirtyCalled).toBe(true)
    world.dispose()
  })
})

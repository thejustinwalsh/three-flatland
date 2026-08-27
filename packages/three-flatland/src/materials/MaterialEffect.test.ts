import { entityFor, traitFor, enrollInWorld } from '../ecs/testUtils.type-test'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BufferGeometry, InstancedInterleavedBuffer, InstancedMesh, Texture } from 'three'
import { getCurrentStack, setCurrentStack, stack } from 'three/tsl'
import { EventNode } from 'three/webgpu'
import { createWorld } from '../ecs/runtime'
import { requiredEntity } from '../ecs/testUtils.type-test'
import { SpriteMaterialRef } from '../ecs/traits'
import { MaterialEffect, createMaterialEffect } from './MaterialEffect'
import type { EffectNodeContext } from './MaterialEffect'
import { Sprite2DMaterial } from './Sprite2DMaterial'
import { MAX_MATERIAL_EFFECTS } from './effectFlagBits'
import {
  Sprite2D,
  LIT_FLAG_MASK,
  RECEIVE_SHADOWS_MASK,
  PIXEL_PERFECT_MASK,
  EFFECT_BIT_OFFSET,
} from '../sprites/Sprite2D'
import { Flatland } from '../Flatland'

// Default low bits set by the coordinated pixel-art preset.
const DEFAULT_FLAGS = LIT_FLAG_MASK | RECEIVE_SHADOWS_MASK | PIXEL_PERFECT_MASK

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
  it('rejects reserved and flattened-collision schema keys atomically', () => {
    const make = (name: string, schema: Record<string, unknown>) =>
      createMaterialEffect({
        name,
        schema: schema as never,
        node: ({ inputColor }) => inputColor,
      })
    const Effects = [
      make('reserved_constructor', { constructor: 1 }),
      make('reserved_own', { name: 1 }),
      make('reserved_method', { _setField: 1 }),
      make('flattened_collision', { vector: [0, 0], vector_0: 1 }),
      make('invalid_non_array', { value: 'invalid' }),
      make('invalid_vec1', { value: [1] }),
      make('invalid_vec5', { value: [1, 2, 3, 4, 5] }),
      make('invalid_component', { value: [1, 'invalid'] }),
      make('invalid_scalar', { value: Number.NaN }),
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
    const AccessorEffect = createMaterialEffect({
      name: 'material_accessor_schema',
      schema: accessorSchema as never,
      node: ({ inputColor }) => inputColor,
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
    const SnapshotEffect = createMaterialEffect({
      name: 'material_snapshot_schema',
      schema: proxySchema as never,
      node: ({ inputColor }) => inputColor,
    })
    const snapshot = new SnapshotEffect()
    expect(descriptorReads).toBe(1)
    expect(SnapshotEffect._fields).toEqual([{ name: 'vector', size: 2, default: [1, 2] }])
    expect(snapshot.vector).toEqual([1, 2])
  })

  it('uses null-prototype records for valid schema metadata and instance snapshots', () => {
    const Effect = createMaterialEffect({
      name: 'null_proto_records',
      schema: { constructor_value: 1, toString_value: () => 7 },
      node: ({ inputColor }) => inputColor,
    })
    const effect = new Effect()

    expect(Object.getPrototypeOf(Effect._fieldKeys)).toBeNull()
    expect(Object.getPrototypeOf(Effect._constantFactories)).toBeNull()
    expect(Object.getPrototypeOf(effect._defaults)).toBeNull()
    expect(Object.getPrototypeOf(effect._constants)).toBeNull()
    effect.constructor_value = 9
    expect(effect.constructor_value).toBe(9)
    expect(effect.toString_value).toBe(7)
  })

  it('should create a class with correct effectName and schema', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    expect(Dissolve.effectName).toBe('dissolve')
    expect(Dissolve.effectSchema.progress).toBe(0)
  })

  it('should auto-create a numeric ECS trait from schema', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    // Initialize to create the trait
    Dissolve._initialize()
    expect(typeof traitFor(Dissolve)).toBe('function')
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
    expect(Object.getOwnPropertyDescriptor(dissolve, 'progress')?.configurable).toBe(false)
  })

  it('rejects emitted subclass fields that would shadow uniform or constant accessors', () => {
    class UniformShadow extends MaterialEffect {
      static readonly effectName = 'uniform_shadow'
      static readonly effectSchema = { progress: 0 } as const
      progress = 1
      static override buildNode({ inputColor }: EffectNodeContext) {
        return inputColor
      }
    }
    class ConstantShadow extends MaterialEffect {
      static readonly effectName = 'constant_shadow'
      static readonly effectSchema = { mode: () => 'base' } as const
      mode = 'field'
      static override buildNode({ inputColor }: EffectNodeContext) {
        return inputColor
      }
    }

    expect(() => new UniformShadow()).toThrow(/Cannot redefine property: progress/)
    expect(() => new ConstantShadow()).toThrow(/Cannot redefine property: mode/)
  })

  it('initializes independent metadata for second-level subclasses', () => {
    class ParentEffect extends MaterialEffect {
      static readonly effectName = 'parent_effect'
      static readonly effectSchema: typeof MaterialEffect.effectSchema = { parentValue: 1 }
      declare parentValue: number
      static override buildNode({ inputColor }: EffectNodeContext) {
        return inputColor
      }
    }
    class ChildEffect extends ParentEffect {
      static override readonly effectName = 'child_effect'
      static override readonly effectSchema: typeof MaterialEffect.effectSchema = { childValue: 2 }
      declare childValue: number
      static override buildNode({ inputColor }: EffectNodeContext) {
        return inputColor
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
    const initial = flash.color
    expect(initial).toEqual([1, 0, 0])
    expect(flash.color).toBe(initial)
    expect(Object.isFrozen(initial)).toBe(true)
    expect(() => {
      ;(initial as unknown as number[])[0] = 9
    }).toThrow(TypeError)
    expect(flash.color).toEqual([1, 0, 0])

    flash.color = [0, 1, 0]
    const updated = flash.color
    expect(updated).toEqual([0, 1, 0])
    expect(updated).not.toBe(initial)
    expect(flash.color).toBe(updated)
    expect(initial).toEqual([1, 0, 0])

    flash.color = [0, 1, 0]
    expect(flash.color).toBe(updated)
  })

  it('keeps changed vector writes allocation-free until the next read', () => {
    const Effect = createMaterialEffect({
      name: 'lazy_material_vector_snapshot',
      schema: { vector: [0, 0, 0] as const },
      node: ({ inputColor }) => inputColor,
    })
    const effect = new Effect()
    const staging = effect._defaults.vector
    const freeze = vi.spyOn(Object, 'freeze')

    try {
      for (let i = 1; i <= 3_000; i++) effect.vector = [i, i + 1, i + 2]

      expect(effect._defaults.vector).toBe(staging)
      expect(freeze).not.toHaveBeenCalled()

      const snapshot = effect.vector
      expect(snapshot).toEqual([3_000, 3_001, 3_002])
      expect(freeze).toHaveBeenCalledOnce()
      expect(effect.vector).toBe(snapshot)
      expect(freeze).toHaveBeenCalledOnce()
    } finally {
      freeze.mockRestore()
    }
  })

  it('keeps ordinary scalar reads off the TileMap override lookup path', () => {
    const Effect = createMaterialEffect({
      name: 'direct_material_scalar_read',
      schema: { amount: 1 },
      node: ({ inputColor }) => inputColor,
    })
    const detached = new Effect()
    let detachedGets = -1
    const detachedGet = vi.spyOn(WeakMap.prototype, 'get')
    try {
      for (let i = 0; i < 100; i++) void detached.amount
      detachedGets = detachedGet.mock.calls.length
    } finally {
      detachedGet.mockRestore()
    }
    expect(detachedGets).toBe(0)

    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Effect)
    const sprite = new Sprite2D({ texture, material })
    const enrolled = new Effect()
    sprite.addEffect(enrolled)
    const world = createWorld()
    enrollInWorld(sprite, world)
    let enrolledGets = -1
    const enrolledGet = vi.spyOn(WeakMap.prototype, 'get')
    try {
      for (let i = 0; i < 100; i++) void enrolled.amount
      enrolledGets = enrolledGet.mock.calls.length
    } finally {
      enrolledGet.mockRestore()
    }
    // Entity + trait resolution are the two existing ECS lookups; there is
    // no third lookup for a TileMap-only transactional override.
    expect(enrolledGets).toBe(200)

    sprite.dispose()
    world.dispose()
    material.dispose()
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

  it('atomically rejects a second instance of the same effect class standalone and enrolled', () => {
    const Effect = createMaterialEffect({
      name: 'single_instance_per_class',
      schema: { value: 0 },
      node: ({ inputColor }) => inputColor,
    })
    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Effect)
    const sprite = new Sprite2D({ texture, material })
    const first = new Effect()
    const rejected = new Effect()
    sprite.addEffect(first)

    expect(() => sprite.addEffect(rejected)).toThrow(/only one 'single_instance_per_class' instance/)
    expect(sprite._effects).toEqual([first])
    expect(sprite._effectFlags).toBe(E0)
    expect(rejected._sprite).toBeNull()
    expect(entityFor(rejected)).toBeNull()

    const world = createWorld()
    enrollInWorld(sprite, world)
    const entity = requiredEntity(sprite)
    const routeBefore = world.read(entity, SpriteMaterialRef)
    const traitBefore = world.read(entity, traitFor(Effect))

    expect(() => sprite.addEffect(rejected)).toThrow(/only one 'single_instance_per_class' instance/)
    expect(sprite._effects).toEqual([first])
    expect(sprite._effectFlags).toBe(E0)
    expect(world.read(entity, SpriteMaterialRef)).toEqual(routeBefore)
    expect(world.read(entity, traitFor(Effect))).toEqual(traitBefore)
    expect(rejected._sprite).toBeNull()
    expect(entityFor(rejected)).toBeNull()
    world.dispose()
  })

  it('atomically rejects an effect instance owned by a different sprite', () => {
    const Effect = createMaterialEffect({
      name: 'cross_owner_rejection',
      schema: { value: 0 },
      node: ({ inputColor }) => inputColor,
    })
    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    const materialA = new Sprite2DMaterial({ map: texture })
    const materialB = new Sprite2DMaterial({ map: texture })
    materialA.registerEffect(Effect)
    materialB.registerEffect(Effect)
    const spriteA = new Sprite2D({ texture, material: materialA })
    const spriteB = new Sprite2D({ texture, material: materialB })
    const effect = new Effect()
    effect.value = 0.75
    spriteA.addEffect(effect)

    const world = createWorld()
    enrollInWorld(spriteA, world)
    enrollInWorld(spriteB, world)
    const entityA = requiredEntity(spriteA)
    const entityB = requiredEntity(spriteB)
    const traitA = world.read(entityA, traitFor(Effect))
    const routeA = world.read(entityA, SpriteMaterialRef)
    const routeB = world.read(entityB, SpriteMaterialRef)

    expect(() => spriteB.addEffect(effect)).toThrow(/already attached to a different sprite/)
    expect(spriteA._effects).toEqual([effect])
    expect(spriteB._effects).toEqual([])
    expect(spriteA._effectFlags).toBe(E0)
    expect(spriteB._effectFlags).toBe(0)
    expect(spriteA.material).toBe(materialA)
    expect(spriteB.material).toBe(materialB)
    expect(world.read(entityA, SpriteMaterialRef)).toEqual(routeA)
    expect(world.read(entityB, SpriteMaterialRef)).toEqual(routeB)
    expect(world.read(entityA, traitFor(Effect))).toEqual(traitA)
    expect(world.has(entityB, traitFor(Effect))).toBe(false)
    expect(effect._sprite).toBe(spriteA)
    expect(entityFor(effect)).toBe(entityA)
    world.dispose()
  })

  it('uses injective constant-variant keys and reuses only identical references', () => {
    const ConstantEffect = createMaterialEffect({
      name: 'injective_constants',
      schema: { left: () => null as unknown, right: () => null as unknown },
      node: ({ inputColor }) => inputColor,
    })
    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    const materialFor = (left: unknown, right: unknown): Sprite2DMaterial => {
      const sprite = new Sprite2D({ texture })
      const effect = new ConstantEffect()
      effect.left = left
      effect.right = right
      sprite.addEffect(effect)
      return sprite.material
    }

    const primitiveMaterials = [materialFor(1, false), materialFor('1', false), materialFor(true, false)]
    expect(new Set(primitiveMaterials).size).toBe(3)

    const delimiterLeft = materialFor('x,right=y', 'z')
    const delimiterRight = materialFor('x', 'y,right=z')
    expect(delimiterLeft).not.toBe(delimiterRight)

    const sharedObject = { id: 1 }
    const sameObjectA = materialFor(sharedObject, null)
    const sameObjectB = materialFor(sharedObject, null)
    const differentObject = materialFor({ id: 1 }, null)
    expect(sameObjectA).toBe(sameObjectB)
    expect(differentObject).not.toBe(sameObjectA)

    const sharedFunction = () => 1
    const sameFunctionA = materialFor(sharedFunction, undefined)
    const sameFunctionB = materialFor(sharedFunction, undefined)
    const differentFunction = materialFor(() => 1, undefined)
    expect(sameFunctionA).toBe(sameFunctionB)
    expect(differentFunction).not.toBe(sameFunctionA)
  })

  it('frames effect names and constant segments across composed variants', () => {
    const A = createMaterialEffect({
      name: 'a',
      schema: { x: () => 1 },
      node: ({ inputColor }) => inputColor,
    })
    const B = createMaterialEffect({
      name: 'b',
      schema: { x: () => 1 },
      node: ({ inputColor }) => inputColor,
    })
    const ImpersonatingComposition = createMaterialEffect({
      name: 'a:1:x:8:number:1;b',
      schema: { x: () => 1 },
      node: ({ inputColor }) => inputColor,
    })
    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    const composed = new Sprite2D({ texture })
    const single = new Sprite2D({ texture })

    composed.addEffect(new A())
    composed.addEffect(new B())
    single.addEffect(new ImpersonatingComposition())

    expect(composed.material).not.toBe(single.material)
    expect(composed.material.getEffects()).toEqual([A, B])
    expect(single.material.getEffects()).toEqual([ImpersonatingComposition])
  })
})

// ============================================
// EffectMaterial.registerEffect — packed buffers
// ============================================

describe('EffectMaterial.registerEffect', () => {
  it('atomically rejects cross-effect packed slot-key collisions', () => {
    const First = createMaterialEffect({
      name: 'a_b',
      schema: { c: 1 },
      node: ({ inputColor }) => inputColor,
    })
    const Colliding = createMaterialEffect({
      name: 'a',
      schema: { b_c: 2 },
      node: ({ inputColor }) => inputColor,
    })
    const material = new Sprite2DMaterial()
    material.registerEffect(First)
    const before = {
      effects: [...material._effects],
      bits: [...material._effectBitIndex],
      slots: [...material._effectSlots],
      total: material._effectTotalFloats,
      tier: material._effectTier,
      version: material._effectSchemaVersion,
    }

    expect(() => material.registerEffect(Colliding)).toThrow(/packed slot key 'a_b_c' collides/)
    expect({
      effects: [...material._effects],
      bits: [...material._effectBitIndex],
      slots: [...material._effectSlots],
      total: material._effectTotalFloats,
      tier: material._effectTier,
      version: material._effectSchemaVersion,
    }).toEqual(before)
  })

  it('rejects a different effect class with the same name in material and sprite add paths', () => {
    const First = createMaterialEffect({
      name: 'duplicate_class_name',
      schema: { first: 1 },
      node: ({ inputColor }) => inputColor,
    })
    const Different = createMaterialEffect({
      name: 'duplicate_class_name',
      schema: { second: 2 },
      node: ({ inputColor }) => inputColor,
    })
    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(First)
    const sprite = new Sprite2D({ texture, material })
    const effect = new Different()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(() => sprite.addEffect(effect)).toThrow(/different effect class already owns that name/)
      expect(warning).toHaveBeenCalledOnce()
    } finally {
      warning.mockRestore()
    }
    expect(material.getEffects()).toEqual([First])
    expect(material.hasEffect(Different)).toBe(false)
    expect(sprite._effects).toHaveLength(0)
    expect(sprite._effectFlags).toBe(0)
    expect(effect._sprite).toBeNull()
  })

  it('accepts 24 data-free effects and atomically rejects the 25th enable bit', () => {
    const Effects = Array.from({ length: MAX_MATERIAL_EFFECTS + 1 }, (_, index) =>
      createMaterialEffect({
        name: `zero-data-${index}`,
        schema: {},
        node: ({ inputColor }) => inputColor,
      })
    )
    const material = new Sprite2DMaterial()

    for (const Effect of Effects.slice(0, MAX_MATERIAL_EFFECTS)) material.registerEffect(Effect)

    expect(material.getEffects()).toHaveLength(MAX_MATERIAL_EFFECTS)
    expect(material._effectBitIndex.get('zero-data-0')).toBe(EFFECT_BIT_OFFSET)
    expect(material._effectBitIndex.get(`zero-data-${MAX_MATERIAL_EFFECTS - 1}`)).toBe(
      EFFECT_BIT_OFFSET + MAX_MATERIAL_EFFECTS - 1
    )
    expect(material._effectTotalFloats).toBe(0)

    const before = {
      effects: [...material._effects],
      constants: [...material._effectConstants],
      slots: [...material._effectSlots].map(([key, slot]) => [key, { ...slot }] as const),
      bitIndices: [...material._effectBitIndex],
      totalFloats: material._effectTotalFloats,
      tier: material._effectTier,
      defaultTier: material._defaultEffectTier,
      schemaVersion: material._effectSchemaVersion,
      instanceAttributes: [...material._instanceAttributes],
      colorNode: material.colorNode,
    }

    expect(() => material.registerEffect(Effects[MAX_MATERIAL_EFFECTS]!)).toThrow(
      `exceeding the exact Float32 capacity of ${MAX_MATERIAL_EFFECTS}`
    )

    expect({
      effects: [...material._effects],
      constants: [...material._effectConstants],
      slots: [...material._effectSlots].map(([key, slot]) => [key, { ...slot }] as const),
      bitIndices: [...material._effectBitIndex],
      totalFloats: material._effectTotalFloats,
      tier: material._effectTier,
      defaultTier: material._defaultEffectTier,
      schemaVersion: material._effectSchemaVersion,
      instanceAttributes: [...material._instanceAttributes],
      colorNode: material.colorNode,
    }).toEqual(before)
  })

  it('atomically rejects a 25th constants effect before changing sprite, ECS route, or cache', () => {
    const Effects = Array.from({ length: MAX_MATERIAL_EFFECTS + 1 }, (_, index) =>
      createMaterialEffect({
        name: `constant-provider-${index}`,
        schema: { variant: () => index },
        node: ({ inputColor }) => inputColor,
      })
    )
    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    const sprite = new Sprite2D({ texture })
    for (const Effect of Effects.slice(0, MAX_MATERIAL_EFFECTS)) sprite.addEffect(new Effect())

    const world = createWorld()
    enrollInWorld(sprite, world)
    const entity = requiredEntity(sprite)
    const RejectedEffect = Effects[MAX_MATERIAL_EFFECTS]!
    const rejected = new RejectedEffect()
    const materialBefore = sprite.material
    const effectsBefore = [...sprite._effects]
    const flagsBefore = sprite._effectFlags
    const routeBefore = world.read(entity, SpriteMaterialRef)
    const getShared = vi.spyOn(Sprite2DMaterial, 'getShared')

    expect(() => sprite.addEffect(rejected)).toThrow(`exceeding the exact Float32 capacity of ${MAX_MATERIAL_EFFECTS}`)
    expect(getShared).not.toHaveBeenCalled()
    getShared.mockRestore()
    expect(sprite.material).toBe(materialBefore)
    expect(sprite._effects).toEqual(effectsBefore)
    expect(sprite._effectFlags).toBe(flagsBefore)
    expect(world.read(entity, SpriteMaterialRef)).toEqual(routeBefore)
    expect(rejected._sprite).toBeNull()
    expect(entityFor(rejected)).toBeNull()
    expect(materialBefore.getEffects()).toHaveLength(MAX_MATERIAL_EFFECTS)
    expect(materialBefore.hasEffect(RejectedEffect)).toBe(false)
    world.dispose()
  })

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
    // Effect data starts at slot 0 (effectBuf0.x) — system flags
    // (instanceSystem.z) and enable bits (instanceSystem.w) live on the
    // interleaved core, so effect buffers carry pure data.
    expect(material._effectSlots.get('dissolve_progress')).toEqual({ offset: 0, size: 1 })
    expect(material._effectTotalFloats).toBe(1) // 1 data float, no reservations
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

    // Slot layout (pure effect data — no system reservations):
    //   0 = dissolve_progress (effectBuf0.x)
    //   1 = flash_intensity   (effectBuf0.y)
    //   2..4 = flash_color    (effectBuf0.z, .w, effectBuf1.x)
    expect(material._effectSlots.get('dissolve_progress')).toEqual({ offset: 0, size: 1 })
    expect(material._effectSlots.get('flash_intensity')).toEqual({ offset: 1, size: 1 })
    expect(material._effectSlots.get('flash_color')).toEqual({ offset: 2, size: 3 })
    expect(material._effectTotalFloats).toBe(5) // 1 + 1 + 3
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
    // 8 floats fits in default tier 8 — no upgrade. Use 12 floats to
    // force a tier bump past the default.
    const Huge = createMaterialEffect({
      name: 'huge',
      schema: {
        a: [0, 0, 0, 0],
        b: [0, 0, 0, 0],
        c: [0, 0, 0, 0],
      },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial()
    const tierChanged = material.registerEffect(Huge)
    expect(tierChanged).toBe(true)
    expect(material._effectTier).toBeGreaterThan(8)
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
    // Three vec4 fields = 12 floats → tier upgrade past the default 8.
    // With system flags/enable bits moved off effectBuf0, two vec4s
    // (8 floats) no longer trigger a tier change.
    const Big = createMaterialEffect({
      name: 'big',
      schema: { a: [0, 0, 0, 0], b: [0, 0, 0, 0], c: [0, 0, 0, 0] },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial()
    expect(material._effectSchemaVersion).toBe(0)

    material.registerEffect(Big)
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
    // Effect data starts at slot 0 (effectBuf0.x); system flags + enable
    // bits moved off effectBuf0 into the interleaved `instanceSystem`.
    expect(cloned._effectSlots.get('dissolve_progress')).toEqual({ offset: 0, size: 1 })
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
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      sprite.addEffect(dissolve)
      expect(warning).toHaveBeenCalledOnce()
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('auto-registering now triggers a shader recompile'))
    } finally {
      warning.mockRestore()
    }

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
    material.registerEffect(Dissolve)
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)

    // System flags untouched; enable bits pick up the first registered effect at bit 0.
    expect(sprite._systemFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectFlags).toBe(E0)

    // System flags + enable bits live on `instanceSystem.z/.w` (offsets
    // 10, 11 within the interleaved stride of 16 floats per vertex).
    const systemAttr = sprite.geometry.getAttribute('instanceSystem')
    expect(systemAttr).toBeDefined()
    const sysArray = (systemAttr as unknown as { array: Float32Array }).array
    expect(sysArray[10]).toBe(DEFAULT_FLAGS) // vertex 0, system.z = system flags
    expect(sysArray[11]).toBe(E0) // vertex 0, system.w = enable bits
  })

  it('should write effect data to correct packed positions', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Dissolve)
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.75
    sprite.addEffect(dissolve)

    // Effect data lives in effectBuf0 starting at slot 0 (no
    // reservations). dissolve_progress is the first (and only) field.
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(0.75) // v0.x = progress
    // All vertices should carry the same value on a standalone sprite.
    expect(array[4]).toBe(0.75) // v1.x
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
    material.registerEffect(DamageFlash)
    const sprite = new Sprite2D({ texture, material })
    const flash = new DamageFlash()
    flash.intensity = 0.8
    flash.color = [0, 1, 0]
    sprite.addEffect(flash)

    // Pure effect layout (no system reservations):
    //   effectBuf0 = [intensity, color_r, color_g, color_b]
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array0 = (buf0 as unknown as { array: Float32Array }).array
    expect(array0[0]).toBeCloseTo(0.8) // intensity (Float32 precision)
    expect(array0[1]).toBe(0) // color_r
    expect(array0[2]).toBe(1) // color_g
    expect(array0[3]).toBe(0) // color_b
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
    material.registerEffect(Dissolve)
    material.registerEffect(Flash)
    const sprite = new Sprite2D({ texture, material })

    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)

    const flash = new Flash()
    flash.intensity = 0.8
    sprite.addEffect(flash)

    // Both enable bits set; system flags untouched. Flags live on
    // instanceSystem now, not effectBuf0.
    expect(sprite._systemFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectFlags).toBe(E0 | E1)

    // Pure effect layout in effectBuf0 (starting at slot 0):
    //   [dissolve_progress, flash_intensity, ...]
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBe(0.5) // dissolve progress
    expect(array[1]).toBeCloseTo(0.8) // flash intensity (Float32 precision)
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
    expect(array[0]).toBeCloseTo(0.9) // updated progress at slot 0 (no reservations)
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

    expect(array1[0]).toBeCloseTo(0.3) // sprite1 progress (slot 0)
    expect(array2[0]).toBeCloseTo(0.7) // sprite2 progress (slot 0)
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
    material.registerEffect(Dissolve)
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)
    expect(sprite._systemFlags).toBe(DEFAULT_FLAGS) // system flags untouched
    expect(sprite._effectFlags).toBe(E0)

    sprite.removeEffect(dissolve)
    expect(sprite._systemFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectFlags).toBe(0)
  })

  it('should reset data slots to defaults', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Dissolve)
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new Dissolve()
    dissolve.progress = 0.75
    sprite.addEffect(dissolve)
    sprite.removeEffect(dissolve)

    // Enable bits + system flags live on instanceSystem now; effect
    // data (progress) is at slot 0 of effectBuf0 and should be reset.
    const sysArr = (sprite.geometry.getAttribute('instanceSystem') as unknown as { array: Float32Array }).array
    const effectArr = (sprite.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array
    expect(sysArr[10]).toBe(DEFAULT_FLAGS) // system flags (unchanged)
    expect(sysArr[11]).toBe(0) // enable bits (cleared)
    expect(effectArr[0]).toBe(0) // progress (reset to default)
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
    material.registerEffect(Dissolve)
    material.registerEffect(Flash)
    const sprite = new Sprite2D({ texture, material })

    const dissolve = new Dissolve()
    dissolve.progress = 0.5
    sprite.addEffect(dissolve)

    const flash = new Flash()
    flash.intensity = 0.8
    sprite.addEffect(flash)

    sprite.removeEffect(dissolve)

    // Flash remains enabled.
    expect(sprite._systemFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectFlags).toBe(E1)

    const sysArr = (sprite.geometry.getAttribute('instanceSystem') as unknown as { array: Float32Array }).array
    const effectArr = (sprite.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }).array
    expect(sysArr[10]).toBe(DEFAULT_FLAGS) // system flags on instanceSystem.z
    expect(sysArr[11]).toBe(E1) // enable bits on instanceSystem.w — only flash
    expect(effectArr[0]).toBe(0) // dissolve progress: reset
    expect(effectArr[1]).toBeCloseTo(0.8) // flash intensity: unchanged
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
    expect(sprite._systemFlags).toBe(DEFAULT_FLAGS)
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
    for (const EffectClass of effects) material.registerEffect(EffectClass)
    const sprite = new Sprite2D({ texture, material })

    // Enable all 5 effects
    for (const EffectClass of effects) {
      const instance = new EffectClass()
      ;(instance as any).value = 1
      sprite.addEffect(instance)
    }

    // Enable bits 0..4 set (one per registered effect); system flags untouched.
    expect(sprite._systemFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectFlags).toBe(E0 | E1 | E2 | E3 | E4)

    const sysArr = (sprite.geometry.getAttribute('instanceSystem') as unknown as { array: Float32Array }).array
    expect(sysArr[10]).toBe(DEFAULT_FLAGS) // system flags on instanceSystem.z
    expect(sysArr[11]).toBe(E0 | E1 | E2 | E3 | E4) // enable bits on instanceSystem.w
  })

  it('should support selective enable/disable', () => {
    const A = createMaterialEffect({
      name: 'a',
      schema: { v: 0 },
      node: ({ inputColor }) => inputColor,
    })
    const B = createMaterialEffect({
      name: 'b',
      schema: { v: 0 },
      node: ({ inputColor }) => inputColor,
    })
    const C = createMaterialEffect({
      name: 'c',
      schema: { v: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(A)
    material.registerEffect(B)
    material.registerEffect(C)
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
    expect(sprite._effectFlags).toBe(E0 | E1 | E2)

    sprite.removeEffect(b)
    expect(sprite._effectFlags).toBe(E0 | E2)

    sprite.removeEffect(a)
    expect(sprite._effectFlags).toBe(E2)

    // Re-add a — creates new instance since the old was detached
    const a2 = new A()
    ;(a2 as any).v = 1
    sprite.addEffect(a2)
    expect(sprite._effectFlags).toBe(E0 | E2)
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
// _setField: direct ECS/batch writes for enrolled sprites
// ============================================

describe('_setField ECS integration', () => {
  // Create effect classes once so each case exercises the same declarations.
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

  it('on enrolled unbatched sprite: writes ECS state without mutating its own buffer', () => {
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(DissolveEnrolled)
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new DissolveEnrolled()
    sprite.addEffect(dissolve)

    // Enroll in world
    const world = createWorld()
    enrollInWorld(sprite, world)

    // Get initial own buffer value — progress is now at slot 0
    // (effectBuf0.x) since system flags/enable bits moved off effectBuf0.
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    const initialValue = array[0]

    // Change progress — ECS state changes, while the standalone own buffer
    // remains staged until this enrolled sprite is demoted back to it.
    dissolve.progress = 0.9

    // Own buffer should NOT have changed
    expect(array[0]).toBe(initialValue)

    // Reading progress returns the new value from the cached ECS store.
    expect(dissolve.progress).toBeCloseTo(0.9)

    world.dispose()
  })

  it('on standalone sprite: writes snapshot + own buffer', () => {
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(DissolveStandalone)
    const sprite = new Sprite2D({ texture, material })
    const dissolve = new DissolveStandalone()
    sprite.addEffect(dissolve)

    // No enrollment — standalone
    dissolve.progress = 0.9

    // Own buffer SHOULD be updated (standalone path). Progress is at
    // slot 0 of effectBuf0 (no system reservations).
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBeCloseTo(0.9)
  })

  it('returns immutable memoized vector snapshots while enrolled', () => {
    const VectorEffect = createMaterialEffect({
      name: 'enrolled_vector_snapshot',
      schema: { vector: [1, 2, 3] as const },
      node: ({ inputColor }) => inputColor,
    })
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(VectorEffect)
    const sprite = new Sprite2D({ texture, material })
    const effect = new VectorEffect()
    sprite.addEffect(effect)
    const world = createWorld()
    enrollInWorld(sprite, world)

    const initial = effect.vector
    expect(initial).toEqual([1, 2, 3])
    expect(effect.vector).toBe(initial)
    expect(Object.isFrozen(initial)).toBe(true)
    expect(() => {
      ;(initial as unknown as number[])[1] = 99
    }).toThrow(TypeError)
    expect(effect.vector).toEqual([1, 2, 3])

    const trait = traitFor(VectorEffect)
    const entity = requiredEntity(sprite)
    const store = world.store(trait)
    const index = world.index(entity)
    store.vector_0![index] = 7
    store.vector_1![index] = 8
    store.vector_2![index] = 9
    const ecsUpdated = effect.vector
    expect(ecsUpdated).toEqual([7, 8, 9])
    expect(ecsUpdated).not.toBe(initial)
    expect(effect.vector).toBe(ecsUpdated)
    expect(initial).toEqual([1, 2, 3])

    const cloned = sprite.clone()
    const clonedEffect = cloned._effects[0] as InstanceType<typeof VectorEffect>
    expect(clonedEffect.vector).toEqual([7, 8, 9])

    effect.vector = [1, 2, 3]
    expect(store.vector_0![index]).toBe(1)
    expect(store.vector_1![index]).toBe(2)
    expect(store.vector_2![index]).toBe(3)
    const restored = effect.vector
    expect(restored).toEqual([1, 2, 3])
    expect(restored).not.toBe(ecsUpdated)
    expect(ecsUpdated).toEqual([7, 8, 9])

    effect.vector = [4, 5, 6]
    const updated = effect.vector
    expect(updated).toEqual([4, 5, 6])
    expect(updated).not.toBe(ecsUpdated)
    expect(effect.vector).toBe(updated)
    expect(initial).toEqual([1, 2, 3])
    expect(ecsUpdated).toEqual([7, 8, 9])

    sprite._unenrollFromWorld()
    const detached = effect.vector
    expect(detached).toEqual([4, 5, 6])
    expect(Object.isFrozen(detached)).toBe(true)
    expect(effect.vector).toBe(detached)
    expect(() => {
      ;(detached as unknown as number[])[2] = 99
    }).toThrow(TypeError)
    expect(effect.vector).toEqual([4, 5, 6])

    cloned.dispose()
    world.dispose()
  })

  it('rejects an oversized standalone vector without corrupting the following packed lane', () => {
    const VectorAndSentinel = createMaterialEffect({
      name: 'vector_and_sentinel',
      schema: { vector: [1, 2] as const, sentinel: 73 },
      node: ({ inputColor }) => inputColor,
    })
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(VectorAndSentinel)
    const sprite = new Sprite2D({ texture, material })
    const effect = new VectorAndSentinel()
    sprite.addEffect(effect)
    const buffer = sprite.geometry.getAttribute('effectBuf0') as unknown as { array: Float32Array }
    const before = buffer.array.slice()
    expect([...before.subarray(0, 4)]).toEqual([1, 2, 73, 0])

    expect(() => effect._setField('vector', [9, 8, 404])).toThrow(/2 numeric components/)

    expect(effect.vector).toEqual([1, 2])
    expect(effect.sentinel).toBe(73)
    expect(buffer.array[2]).toBe(73)
    expect(buffer.array).toEqual(before)

    const reads = [0, 0]
    const divergent = new Proxy([9, 8], {
      get(target, property, receiver) {
        if (property === '0' || property === '1') reads[Number(property)]!++
        return Reflect.get(target, property, receiver)
      },
    })
    effect._setField('vector', divergent)
    expect(reads).toEqual([1, 1])
    expect(effect.vector).toEqual([9, 8])
    expect(buffer.array[2]).toBe(73)

    const beforeThrow = buffer.array.slice()
    const throwing = new Proxy([4, 5], {
      get(target, property, receiver) {
        if (property === '1') throw new Error('component read failed')
        return Reflect.get(target, property, receiver)
      },
    })
    expect(() => effect._setField('vector', throwing)).toThrow('component read failed')
    expect(effect.vector).toEqual([9, 8])
    expect(effect.sentinel).toBe(73)
    expect(buffer.array).toEqual(beforeThrow)
  })
})

// ============================================
// Clone
// ============================================

// ============================================
// R3F declarative attach: effect setter
// ============================================

// ============================================
// addEffect for already-enrolled sprites (trait publication)
// ============================================

describe('addEffect publishes traits for enrolled sprites', () => {
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

  it('should publish the effect trait when adding to an enrolled sprite', () => {
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(DissolveChanged)
    const sprite = new Sprite2D({ texture, material })

    // Enroll first, then add effect (simulates conditional rendering)
    const world = createWorld()
    enrollInWorld(sprite, world)

    const dissolve = new DissolveChanged()
    dissolve.progress = 0.6
    sprite.addEffect(dissolve)

    // Trait should exist with correct value
    expect(world.has(requiredEntity(sprite), traitFor(DissolveChanged))).toBe(true)
    const traitData = world.read(requiredEntity(sprite), traitFor(DissolveChanged)) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.6)

    world.dispose()
  })

  it('should preserve defaults when adding to enrolled sprite', () => {
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(DissolveChanged)
    const sprite = new Sprite2D({ texture, material })

    // Enroll first
    const world = createWorld()
    enrollInWorld(sprite, world)

    // Create effect, set props, then add (simulates R3F applyProps before attach)
    const dissolve = new DissolveChanged()
    dissolve.progress = 0.42

    sprite.addEffect(dissolve)

    // Trait should have value from _defaults (set before attachment)
    const traitData = world.read(requiredEntity(sprite), traitFor(DissolveChanged)) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.42)

    world.dispose()
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

  it('standalone: removeEffect + addEffect cycle preserves functionality', () => {
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(DissolveRA)
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
    expect(sprite._systemFlags).toBe(DEFAULT_FLAGS)
    expect(sprite._effectFlags).toBe(E0)

    // Property updates should write to own buffer. Progress at slot 0
    // of effectBuf0 (pure effect layout — no system reservations).
    d2.progress = 0.9
    const buf0 = sprite.geometry.getAttribute('effectBuf0')
    const array = (buf0 as unknown as { array: Float32Array }).array
    expect(array[0]).toBeCloseTo(0.9)
  })

  it('enrolled: removeEffect + addEffect cycle preserves trait functionality', () => {
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(DissolveRA)
    const sprite = new Sprite2D({ texture, material })

    const d1 = new DissolveRA()
    d1.progress = 0.3
    sprite.addEffect(d1)

    // Enroll
    const world = createWorld()
    enrollInWorld(sprite, world)

    // Verify initial state
    expect(world.has(requiredEntity(sprite), traitFor(DissolveRA))).toBe(true)

    // Simulate R3F detach
    sprite.removeEffect(d1)

    expect(world.has(requiredEntity(sprite), traitFor(DissolveRA))).toBe(false)
    expect(entityFor(d1)).toBeNull()
    expect(d1._sprite).toBeNull()

    // Simulate R3F attach with new instance
    const d2 = new DissolveRA()
    d2.progress = 0.8
    sprite.addEffect(d2)

    // New effect should be attached with correct entity
    expect(d2._sprite).toBe(sprite)
    expect(entityFor(d2)).toBe(entityFor(sprite))
    expect(world.has(requiredEntity(sprite), traitFor(DissolveRA))).toBe(true)

    // Property updates should write to trait (enrolled path)
    d2.progress = 0.95
    const traitData = world.read(requiredEntity(sprite), traitFor(DissolveRA)) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.95)

    world.dispose()
  })

  it('enrolled: property updates work after removeEffect + addEffect cycle', () => {
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(DissolveRA)
    const sprite = new Sprite2D({ texture, material })

    const d1 = new DissolveRA()
    d1.progress = 0.3
    sprite.addEffect(d1)

    // Enroll (simulates spriteGroup.add)
    const world = createWorld()
    enrollInWorld(sprite, world)

    // Verify enrolled state
    expect(world.has(requiredEntity(sprite), traitFor(DissolveRA))).toBe(true)

    // Remove and re-add
    sprite.removeEffect(d1)
    const d2 = new DissolveRA()
    d2.progress = 0.7
    sprite.addEffect(d2)

    // The critical test: can we update progress on the new instance?
    d2.progress = 0.85
    const traitData = world.read(requiredEntity(sprite), traitFor(DissolveRA)) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.85)

    // And does _effects contain the new instance?
    expect(sprite._effects.find((e) => e.name === 'dissolve_ra')).toBe(d2)

    world.dispose()
  })

  it('enrolled: effect ref functional after multiple cycles', () => {
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(DissolveRA)
    const sprite = new Sprite2D({ texture, material })

    // Enroll first, then add effect (like conditional rendering)
    const world = createWorld()
    enrollInWorld(sprite, world)

    // Cycle 1
    const d1 = new DissolveRA()
    d1.progress = 0.1
    sprite.addEffect(d1)
    expect(sprite._effects.find((e) => e.name === 'dissolve_ra')).toBe(d1)

    sprite.removeEffect(d1)
    expect(sprite._effects.find((e) => e.name === 'dissolve_ra')).toBeUndefined()

    // Cycle 2
    const d2 = new DissolveRA()
    d2.progress = 0.5
    sprite.addEffect(d2)
    expect(sprite._effects.find((e) => e.name === 'dissolve_ra')).toBe(d2)

    // Update directly on effect ref — the actual game pattern
    d2.progress = 0.75
    const traitData = world.read(requiredEntity(sprite), traitFor(DissolveRA)) as Record<string, number>
    expect(traitData['progress']).toBeCloseTo(0.75)

    world.dispose()
  })

  it('enrolled: effect flags correct after remove + add cycle', () => {
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(DissolveRA)
    const sprite = new Sprite2D({ texture, material })

    const world = createWorld()
    enrollInWorld(sprite, world)

    const d1 = new DissolveRA()
    sprite.addEffect(d1)
    expect(sprite._effectFlags).toBe(E0)

    sprite.removeEffect(d1)
    expect(sprite._effectFlags).toBe(0)

    const d2 = new DissolveRA()
    sprite.addEffect(d2)
    expect(sprite._effectFlags).toBe(E0)

    world.dispose()
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

  it('runs all internal dispose hooks and public disposal while preserving the exact first error', () => {
    const Dissolve = createMaterialEffect({
      name: 'dispose_first_error',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })
    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Dissolve)
    const secondInternal = vi.fn()
    const publicListener = vi.fn()
    material._addPreDisposeHook(() => {
      throw 0
    })
    material._addPreDisposeHook(secondInternal)
    material.addEventListener('dispose', publicListener)

    let thrown: unknown = Symbol('not-thrown')
    try {
      material.dispose()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(0)
    expect(secondInternal).toHaveBeenCalledOnce()
    expect(publicListener).toHaveBeenCalledOnce()
    expect(material.getEffects()).toEqual([])
    expect(material._effectConstants.size).toBe(0)
    expect(material._effectSlots.size).toBe(0)
    expect(material._effectBitIndex.size).toBe(0)
    expect(material._effectTotalFloats).toBe(0)
    expect(material._effectTier).toBe(0)
  })

  it('sprite dispose cleans up own geometry and effects', () => {
    const Dissolve = createMaterialEffect({
      name: 'dissolve_disp3',
      schema: { progress: 0 },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    material.registerEffect(Dissolve)
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
      schema: {
        progress: 0,
        offset: [0, 0] as const,
        padding0: [0, 0, 0, 0] as const,
        padding1: [0, 0, 0, 0] as const,
      },
      node: ({ inputColor }) => inputColor,
    })

    const material = new Sprite2DMaterial({ map: texture })
    const unrelated = new Sprite2D({ texture })
    const unrelatedMaterial = unrelated.material
    expect(unrelated.geometry.getAttribute('effectBuf2')).toBeUndefined()
    const dissolve = new Dissolve()
    dissolve.progress = 0.7
    dissolve.offset = [3, 4]
    material.registerEffect(Dissolve)
    const sprite = new Sprite2D({ texture, material })
    sprite.addEffect(dissolve)

    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let cloned: Sprite2D
    try {
      cloned = sprite.clone()
      expect(warning).not.toHaveBeenCalled()
    } finally {
      warning.mockRestore()
    }
    expect(cloned._effects).toHaveLength(1)
    expect(cloned._systemFlags).toBe(DEFAULT_FLAGS)
    expect(cloned._effectFlags).toBe(E0)
    expect(cloned.material).toBe(material)
    expect(cloned.material).not.toBe(unrelatedMaterial)
    expect(cloned.material._effectTier).toBeGreaterThan(8)
    expect(cloned.geometry.getAttribute('effectBuf2')).toBeDefined()
    expect(unrelated.material).toBe(unrelatedMaterial)
    expect(unrelated.material.hasEffect(Dissolve)).toBe(false)
    expect(unrelated.material._effectTier).toBe(8)
    expect(unrelated.geometry.getAttribute('effectBuf2')).toBeUndefined()

    // Cloned effect should be independent
    const clonedDissolve = cloned._effects[0]!
    expect(clonedDissolve).not.toBe(dissolve)
    expect(clonedDissolve.name).toBe('dissolve')
    expect((clonedDissolve as any).progress).toBeCloseTo(0.7)
    const clonedOffset = (clonedDissolve as InstanceType<typeof Dissolve>).offset
    expect(clonedOffset).toEqual([3, 4])
    expect(Object.isFrozen(clonedOffset)).toBe(true)
    expect(() => {
      ;(clonedOffset as unknown as number[])[0] = 99
    }).toThrow(TypeError)
    expect((clonedDissolve as InstanceType<typeof Dissolve>).offset).toEqual([3, 4])
    cloned.dispose()
    unrelated.dispose()
    sprite.dispose()
    material.dispose()
  })

  it('preserves authored primitive and reference constants', () => {
    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    const ConstantEffect = createMaterialEffect({
      name: 'sprite_clone_constants',
      schema: {
        amount: 0,
        variant: () => 'default',
        resource: () => ({ kind: 'default' }),
      },
      node: ({ inputColor }) => inputColor,
    })
    const resource = { kind: 'authored' }
    const effect = new ConstantEffect()
    effect.amount = 4
    effect.variant = 'authored'
    effect.resource = resource
    const sprite = new Sprite2D({ texture })
    sprite.addEffect(effect)

    const cloned = sprite.clone()
    const clonedEffect = cloned._effects[0] as InstanceType<typeof ConstantEffect>
    expect(cloned.material).toBe(sprite.material)
    expect(clonedEffect.amount).toBe(4)
    expect(clonedEffect.variant).toBe('authored')
    expect(clonedEffect.resource).toBe(resource)

    cloned.dispose()
    sprite.dispose()
  })

  it('re-resolves a registry-default clone into another Flatland without touching bootstrap schema', () => {
    const texture = new Texture()
    texture.image = { width: 32, height: 32 }
    const WideEffect = createMaterialEffect({
      name: 'sprite_clone_cross_world_wide',
      schema: {
        direction: [0, 0] as const,
        padding0: [0, 0, 0, 0] as const,
        padding1: [0, 0, 0, 0] as const,
      },
      node: ({ inputColor }) => inputColor,
    })
    const unrelated = new Sprite2D({ texture })
    const unrelatedBootstrap = unrelated.material
    const sourceFlatland = new Flatland()
    const destinationFlatland = new Flatland()
    const source = new Sprite2D({ texture })
    sourceFlatland.add(source)
    source.material.registerEffect(WideEffect)
    source._setupInstanceAttributes()
    const effect = new WideEffect()
    effect.direction = [7, 8]
    source.addEffect(effect)
    expect(source._materialWasRegistryDefault).toBe(true)

    const cloned = source.clone()
    const stagingMaterial = cloned.material
    const disposeStaging = vi.spyOn(stagingMaterial, 'dispose')
    stagingMaterial.addEventListener('dispose', () => {
      throw 0
    })
    expect(stagingMaterial).not.toBe(source.material)
    expect(cloned._materialIsBootstrapDefault).toBe(true)
    let thrown: unknown = Symbol('not thrown')
    try {
      destinationFlatland.add(cloned)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(0)
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(cloned.material).not.toBe(stagingMaterial)
    expect(cloned.material).not.toBe(source.material)
    expect(cloned._materialIsBootstrapDefault).toBe(false)
    expect(cloned._materialWasRegistryDefault).toBe(true)
    expect(cloned.material._effectTier).toBeGreaterThan(8)
    expect(cloned.geometry.getAttribute('effectBuf2')).toBeDefined()
    expect((cloned._effects[0] as InstanceType<typeof WideEffect>).direction).toEqual([7, 8])
    expect((Reflect.get(sourceFlatland, '_spriteMaterials') as Set<Sprite2DMaterial>).has(source.material)).toBe(true)
    expect((Reflect.get(destinationFlatland, '_spriteMaterials') as Set<Sprite2DMaterial>).has(cloned.material)).toBe(
      true
    )
    expect(entityFor(cloned)).not.toBeNull()
    expect(destinationFlatland.spriteGroup.spriteCount).toBe(1)
    expect(() => destinationFlatland.add(cloned)).not.toThrow()
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(unrelated.material).toBe(unrelatedBootstrap)
    expect(unrelatedBootstrap.hasEffect(WideEffect)).toBe(false)
    expect(unrelatedBootstrap._effectTier).toBe(8)
    expect(unrelated.geometry.getAttribute('effectBuf2')).toBeUndefined()

    const destinationMaterial = cloned.material
    destinationMaterial.dispose()
    expect(cloned.material).not.toBe(destinationMaterial)
    expect(cloned._materialWasRegistryDefault).toBe(true)
    expect(cloned.material.hasEffect(WideEffect)).toBe(true)
    expect(cloned.geometry.getAttribute('effectBuf2')).toBeDefined()

    destinationFlatland.dispose()
    sourceFlatland.dispose()
    cloned.dispose()
    source.dispose()
    unrelated.dispose()
  })

  it('commits same-Flatland variant clone adoption before rethrowing staging cleanup', () => {
    const texture = new Texture()
    texture.image = { width: 16, height: 16 }
    const VariantEffect = createMaterialEffect({
      name: 'sprite_clone_same_world_variant',
      schema: {
        amount: [0, 0, 0, 0] as const,
        padding: [0, 0, 0, 0] as const,
        tail: [0, 0] as const,
        variant: () => 'default',
      },
      node: ({ inputColor }) => inputColor,
    })
    const flatland = new Flatland()
    const source = new Sprite2D({ texture })
    flatland.add(source)
    const effect = new VariantEffect()
    effect.amount = [1, 2, 3, 4]
    effect.variant = 'authored'
    source.addEffect(effect)
    const cloned = source.clone()
    const staging = cloned.material
    const disposeStaging = vi.spyOn(staging, 'dispose')
    staging.addEventListener('dispose', () => {
      throw 0
    })

    let thrown: unknown = Symbol('not thrown')
    try {
      flatland.add(cloned)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(0)
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(cloned.material).toBe(source.material)
    expect(cloned._materialWasRegistryVariant).toBe(true)
    expect(entityFor(cloned)).not.toBeNull()
    expect(flatland.spriteGroup.spriteCount).toBe(2)
    expect(() => flatland.add(cloned)).not.toThrow()
    expect(disposeStaging).toHaveBeenCalledTimes(1)

    const managedVariant = cloned.material
    managedVariant.dispose()
    expect(cloned.material).not.toBe(managedVariant)
    expect(cloned.material).toBe(source.material)
    expect(cloned._materialWasRegistryVariant).toBe(true)
    expect(cloned.geometry.getAttribute('effectBuf2')).toBeDefined()
    expect((cloned._effects[0] as InstanceType<typeof VariantEffect>).amount).toEqual([1, 2, 3, 4])

    flatland.dispose()
    cloned.dispose()
    source.dispose()
  })
})

describe('Sprite2DMaterial clipping', () => {
  it('keeps clipping in the fragment stage for synthesized instance positions', () => {
    const material = new Sprite2DMaterial()
    const builder = { hardwareClipping: true }

    material.setupHardwareClipping(builder as never)

    expect(builder.hardwareClipping).toBe(false)
  })
})

describe('Sprite2DMaterial synthesized positions', () => {
  it('builds the synthesized corner and shared instance transform without a second helper call', () => {
    const material = new Sprite2DMaterial()
    const mesh = new InstancedMesh(new BufferGeometry(), undefined, 1)
    const nodeStack = stack()
    const previousStack = getCurrentStack()

    setCurrentStack(nodeStack)
    try {
      material.setupPosition({
        object: mesh,
        getUniformBufferLimit: () => Number.POSITIVE_INFINITY,
        hasGeometryAttribute: () => false,
        needsPreviousData: () => false,
      } as never)
    } finally {
      setCurrentStack(previousStack)
    }

    const assignments = nodeStack.nodes.filter((node) => 'isAssignNode' in node && node.isAssignNode)
    const helperCalls = nodeStack.nodes.filter(
      (node) => 'isShaderCallNodeInternal' in node && node.isShaderCallNodeInternal
    )

    expect(assignments.length).toBeGreaterThanOrEqual(3)
    expect(helperCalls).toHaveLength(0)
  })

  it('updates motion history from the rendered object rather than a captured mesh', () => {
    const material = new Sprite2DMaterial()
    const mesh = new InstancedMesh(new BufferGeometry(), material, 2048)
    const nodeStack = stack()
    const previousStack = getCurrentStack()

    setCurrentStack(nodeStack)
    try {
      material.setupPosition({
        object: mesh,
        getUniformBufferLimit: () => 65_536,
        hasGeometryAttribute: () => false,
        needsPreviousData: () => true,
      } as never)
    } finally {
      setCurrentStack(previousStack)
    }

    const event = nodeStack.nodes.find(
      (node): node is EventNode => node instanceof EventNode && node.eventType === EventNode.OBJECT
    )
    expect(event, 'motion history must register a canonical object update').toBeDefined()
    expect(Function.prototype.toString.call(event!.callback)).toContain('renderedObject')

    const interleavedBuffers = new Set<InstancedInterleavedBuffer>()
    const visited = new WeakSet<object>()
    const visit = (value: unknown): void => {
      if (typeof value !== 'object' || value === null || visited.has(value)) return
      visited.add(value)
      if (value instanceof InstancedInterleavedBuffer) interleavedBuffers.add(value)
      for (const child of Object.values(value)) visit(child)
    }
    visit(nodeStack)

    expect(interleavedBuffers.size, 'current and previous matrices must both use the large-batch path').toBe(2)
    const previousBuffer = [...interleavedBuffers].find((buffer) => buffer.array !== mesh.instanceMatrix.array)
    expect(previousBuffer).toBeDefined()
    const previousVersion = previousBuffer!.version
    mesh.instanceMatrix.array[12] = 42
    expect(() => event!.update({ object: mesh } as never)).not.toThrow()
    expect(previousBuffer!.array[12]).toBe(42)
    expect(previousBuffer!.version).toBe(previousVersion + 1)

    material.dispose()
    mesh.geometry.dispose()
  })
})

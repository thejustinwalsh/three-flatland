import { traitFor } from '../testUtils.type-test'
import { registerSpriteGroupRuntime } from '../../internal/sprite-group-runtime'
import { setEffectEntity } from '../../internal/effect-runtime'
import type { SpriteGroup } from '../../pipeline/SpriteGroup'
import { describe, expect, it, vi } from 'vitest'
import { createLightEffect } from '../../lights/LightEffect'
import { PassEffect, createPassEffect, type PassEffectFn } from '../../pipeline/PassEffect'
import { createWorld, type NumericSchema, type NumericTrait } from '../runtime'

describe('global effect field SoA access', () => {
  it('keeps PassEffect accessors non-configurable and rejects emitted shadow fields', () => {
    class UniformShadow extends PassEffect {
      static readonly passName = 'pass_uniform_shadow'
      static readonly passSchema = { intensity: 0 } as const
      intensity = 1
      static override buildPass(): PassEffectFn {
        return (input) => input
      }
    }
    class ConstantShadow extends PassEffect {
      static readonly passName = 'pass_constant_shadow'
      static readonly passSchema = { mode: () => 'base' } as const
      mode = 'field'
      static override buildPass(): PassEffectFn {
        return (input) => input
      }
    }
    const Declared = createPassEffect({
      name: 'pass_declared_accessor',
      schema: { intensity: 0, mode: () => 'base' },
      pass: () => (input) => input,
    })
    const declared = new Declared()
    expect(Object.getOwnPropertyDescriptor(declared, 'intensity')?.configurable).toBe(false)
    expect(Object.getOwnPropertyDescriptor(declared, 'mode')?.configurable).toBe(false)
    declared.intensity = 2
    expect(declared.intensity).toBe(2)

    expect(() => new UniformShadow()).toThrow(/Cannot redefine property: intensity/)
    expect(() => new ConstantShadow()).toThrow(/Cannot redefine property: mode/)
  })

  it('validates PassEffect schema keys before committing metadata', () => {
    const make = (name: string, schema: Record<string, unknown>) =>
      createPassEffect({ name, schema: schema as never, pass: () => (input) => input })
    const Effects = [
      make('pass_reserved_constructor', { constructor: 1 }),
      make('pass_reserved_own', { name: 1 }),
      make('pass_reserved_method', { _setField: 1 }),
      make('pass_flattened_collision', { vector: [0, 0], vector_0: 1 }),
      make('pass_invalid_non_array', { value: 'invalid' }),
      make('pass_invalid_vec1', { value: [1] }),
      make('pass_invalid_vec5', { value: [1, 2, 3, 4, 5] }),
      make('pass_invalid_component', { value: [1, 'invalid'] }),
      make('pass_invalid_scalar', { value: Number.NEGATIVE_INFINITY }),
    ]

    for (const Effect of Effects) {
      expect(() => new Effect()).toThrow(/conflicts|flatten|numeric tuple|finite/)
      expect(Effect._initialized).toBe(false)
    }
  })

  it('rejects PassEffect schema accessors and uses one cloned descriptor snapshot', () => {
    let getterReads = 0
    const accessorSchema = Object.defineProperty({}, 'vector', {
      enumerable: true,
      get() {
        getterReads++
        return [1, 2]
      },
    })
    const AccessorEffect = createPassEffect({
      name: 'pass_accessor_schema',
      schema: accessorSchema as never,
      pass: () => (input) => input,
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
    const SnapshotEffect = createPassEffect({
      name: 'pass_snapshot_schema',
      schema: proxySchema as never,
      pass: () => (input) => input,
    })
    const snapshot = new SnapshotEffect()
    expect(descriptorReads).toBe(1)
    expect(SnapshotEffect._fields).toEqual([{ name: 'vector', size: 2, default: [1, 2] }])
    const initial = snapshot.vector
    expect(initial).toEqual([1, 2])
    expect(snapshot.vector).toBe(initial)
    expect(Object.isFrozen(initial)).toBe(true)
    expect(() => {
      ;(initial as unknown as number[])[0] = 9
    }).toThrow(TypeError)
    expect(snapshot.vector).toEqual([1, 2])

    snapshot.vector = [3, 4]
    const updated = snapshot.vector
    expect(updated).toEqual([3, 4])
    expect(updated).not.toBe(initial)
    expect(snapshot.vector).toBe(updated)
    expect(initial).toEqual([1, 2])

    snapshot.vector = [3, 4]
    expect(snapshot.vector).toBe(updated)
  })

  it('initializes independent PassEffect metadata for second-level subclasses', () => {
    class ParentEffect extends PassEffect {
      static readonly passName = 'parent_pass_effect'
      static readonly passSchema: typeof PassEffect.passSchema = { parentValue: 1 }
      declare parentValue: number
      static override buildPass(): PassEffectFn {
        return (input) => input
      }
    }
    class ChildEffect extends ParentEffect {
      static override readonly passName = 'child_pass_effect'
      static override readonly passSchema: typeof PassEffect.passSchema = { childValue: 2 }
      declare childValue: number
      static override buildPass(): PassEffectFn {
        return (input) => input
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

  it('uses null-prototype PassEffect schema records without changing uniform behavior', () => {
    const Effect = createPassEffect({
      name: 'pass_null_proto_records',
      schema: { constructor_value: 1, toString_value: () => 7 },
      pass: () => (input) => input,
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

  it('updates LightEffect scalar/vector fields without cold reads, patches, events, or vector allocations', () => {
    const Effect = createLightEffect({
      name: 'light_field_hot_path',
      schema: { scalar: 0, vector: [0, 0, 0] as const },
      light: () => () => null as never,
    })
    const world = createWorld()
    const effect = new Effect()
    const trait = traitFor(Effect) as NumericTrait<NumericSchema>
    const entity = world.spawn(trait({ scalar: 1, vector_0: 2, vector_1: 3, vector_2: 4 }))
    const spriteGroup = {} as SpriteGroup
    registerSpriteGroupRuntime(spriteGroup, () => world)
    effect._attach({ spriteGroup, _markLightingDirty: () => {} })
    setEffectEntity(effect, entity)
    const readSpy = vi.spyOn(world, 'read')
    const patchSpy = vi.spyOn(world, 'patch')
    const touchSpy = vi.spyOn(world, 'touch')

    const vector = effect.vector
    expect(effect.vector).toBe(vector)
    expect(vector).toEqual([2, 3, 4])
    expect(Object.isFrozen(vector)).toBe(true)
    expect(() => {
      ;(vector as unknown as number[])[0] = 99
    }).toThrow(TypeError)
    expect(effect.vector).toEqual([2, 3, 4])
    expect(() => effect._setField('vector', [99])).toThrow(/3 numeric components/)
    expect(() => effect._setField('vector', [99, 98, 97, 96])).toThrow(/3 numeric components/)
    expect(effect.vector).toEqual([2, 3, 4])
    const lightStore = world.store(trait)
    const lightIndex = world.index(entity)
    lightStore.vector_0![lightIndex] = 12
    lightStore.vector_1![lightIndex] = 13
    lightStore.vector_2![lightIndex] = 14
    const ecsUpdated = effect.vector
    expect(ecsUpdated).toEqual([12, 13, 14])
    expect(ecsUpdated).not.toBe(vector)
    expect(effect.vector).toBe(ecsUpdated)
    expect(vector).toEqual([2, 3, 4])
    const lightReads = [0, 0, 0]
    effect._setField(
      'vector',
      new Proxy([6, 7, 8], {
        get(target, property, receiver) {
          if (property === '0' || property === '1' || property === '2') lightReads[Number(property)]!++
          return Reflect.get(target, property, receiver)
        },
      })
    )
    expect(lightReads).toEqual([1, 1, 1])
    const beforeLightThrow = [...effect.vector]
    expect(() =>
      effect._setField(
        'vector',
        new Proxy([9, 10, 11], {
          get(target, property, receiver) {
            if (property === '1') throw new Error('light component read failed')
            return Reflect.get(target, property, receiver)
          },
        })
      )
    ).toThrow('light component read failed')
    expect(effect.vector).toEqual(beforeLightThrow)
    effect.scalar = 5
    effect.vector = [6, 7, 8]

    expect(world.store(trait).scalar[world.index(entity)]).toBe(5)
    const updated = effect.vector
    expect(updated).toEqual([6, 7, 8])
    expect(updated).not.toBe(ecsUpdated)
    expect(effect.vector).toBe(updated)
    expect(vector).toEqual([2, 3, 4])
    expect(ecsUpdated).toEqual([12, 13, 14])
    expect(readSpy).not.toHaveBeenCalled()
    expect(patchSpy).not.toHaveBeenCalled()
    expect(touchSpy).not.toHaveBeenCalled()
    world.dispose()
  })

  it('updates PassEffect scalar/vector fields without cold reads, patches, events, or vector allocations', () => {
    const Effect = createPassEffect({
      name: 'pass_field_hot_path',
      schema: { scalar: 0, vector: [0, 0, 0, 0] as const },
      pass: () => (input) => input,
    })
    const world = createWorld()
    const effect = new Effect()
    const baseClass: typeof PassEffect = Effect
    expect(baseClass._fieldKeys.vector).toEqual(['vector_0', 'vector_1', 'vector_2', 'vector_3'])
    expect(baseClass._fieldMap.get('vector')?.size).toBe(4)
    const trait = traitFor(Effect) as NumericTrait<NumericSchema>
    const entity = world.spawn(trait({ scalar: 1, vector_0: 2, vector_1: 3, vector_2: 4, vector_3: 5 }))
    const spriteGroup = {} as SpriteGroup
    registerSpriteGroupRuntime(spriteGroup, () => world)
    effect._attach({ spriteGroup, _markPostPassDirty: () => {} })
    setEffectEntity(effect, entity)
    const readSpy = vi.spyOn(world, 'read')
    const patchSpy = vi.spyOn(world, 'patch')
    const touchSpy = vi.spyOn(world, 'touch')

    const vector = effect.vector
    expect(effect.vector).toBe(vector)
    expect(vector).toEqual([2, 3, 4, 5])
    expect(Object.isFrozen(vector)).toBe(true)
    expect(() => {
      ;(vector as unknown as number[])[3] = 99
    }).toThrow(TypeError)
    expect(effect.vector).toEqual([2, 3, 4, 5])
    expect(() => effect._setField('vector', [99])).toThrow(/4 numeric components/)
    expect(() => effect._setField('vector', [99, 98, 97, 96, 95])).toThrow(/4 numeric components/)
    expect(effect.vector).toEqual([2, 3, 4, 5])
    const passStore = world.store(trait)
    const passIndex = world.index(entity)
    passStore.vector_0![passIndex] = 12
    passStore.vector_1![passIndex] = 13
    passStore.vector_2![passIndex] = 14
    passStore.vector_3![passIndex] = 15
    const ecsUpdated = effect.vector
    expect(ecsUpdated).toEqual([12, 13, 14, 15])
    expect(ecsUpdated).not.toBe(vector)
    expect(effect.vector).toBe(ecsUpdated)
    expect(vector).toEqual([2, 3, 4, 5])
    const passReads = [0, 0, 0, 0]
    effect._setField(
      'vector',
      new Proxy([7, 8, 9, 10], {
        get(target, property, receiver) {
          if (property === '0' || property === '1' || property === '2' || property === '3') {
            passReads[Number(property)]!++
          }
          return Reflect.get(target, property, receiver)
        },
      })
    )
    expect(passReads).toEqual([1, 1, 1, 1])
    const beforePassThrow = [...effect.vector]
    expect(() =>
      effect._setField(
        'vector',
        new Proxy([11, 12, 13, 14], {
          get(target, property, receiver) {
            if (property === '2') throw new Error('pass component read failed')
            return Reflect.get(target, property, receiver)
          },
        })
      )
    ).toThrow('pass component read failed')
    expect(effect.vector).toEqual(beforePassThrow)
    effect.scalar = 6
    effect.vector = [7, 8, 9, 10]

    expect(world.store(trait).scalar[world.index(entity)]).toBe(6)
    const updated = effect.vector
    expect(updated).toEqual([7, 8, 9, 10])
    expect(updated).not.toBe(ecsUpdated)
    expect(effect.vector).toBe(updated)
    expect(vector).toEqual([2, 3, 4, 5])
    expect(ecsUpdated).toEqual([12, 13, 14, 15])
    expect(readSpy).not.toHaveBeenCalled()
    expect(patchSpy).not.toHaveBeenCalled()
    expect(touchSpy).not.toHaveBeenCalled()
    world.dispose()
  })
})

import { entityFor, traitFor, worldFor } from './ecs/testUtils.type-test'
import { describe, expect, it, vi } from 'vitest'
import { Group } from 'three'
import { vec4 } from 'three/tsl'
import { Flatland } from './Flatland'
import { Sprite2D } from './sprites/Sprite2D'
import { createLightEffect } from './lights/LightEffect'
import { createPassEffect } from './pipeline/PassEffect'
import type { PassEffect, PassEffectFn } from './pipeline/PassEffect'
import { LightEffectTrait, LightingContext, ShadowPipeline } from './ecs/traits'
import { select, type NumericSchema, type NumericTrait, type World } from './ecs/runtime'
import { shadowPipelineSystem } from './ecs/systems/shadowPipelineSystem'

const OwnedPass = createPassEffect({
  name: 'ownedPassBoundary',
  schema: { amount: 0.5 },
  pass: () => (input) => input,
})

let passDisposeFlatland: Flatland | null = null
const DisposingPass = createPassEffect({
  name: 'disposingPassBoundary',
  schema: { amount: 0.5 },
  pass: () => {
    passDisposeFlatland?.dispose()
    return (input) => input
  },
})

let samePassFlatland: Flatland | null = null
let samePassCandidate: PassEffect | null = null
const ReentrantPass = createPassEffect({
  name: 'reentrantPassBoundary',
  schema: { amount: 0.5 },
  pass: () => {
    if (samePassFlatland && samePassCandidate) samePassFlatland.addPass(samePassCandidate)
    return (input) => input
  },
})

let crossPassFlatland: Flatland | null = null
let crossPassCandidate: PassEffect | null = null
const CrossFlatlandPass = createPassEffect({
  name: 'crossFlatlandPassBoundary',
  schema: { amount: 0.5 },
  pass: () => {
    if (crossPassFlatland && crossPassCandidate) crossPassFlatland.addPass(crossPassCandidate)
    return (input) => input
  },
})

const SharedLight = createLightEffect({
  name: 'sharedLightBoundary',
  schema: { intensity: 1 },
  light: () => (context) => vec4(context.color.rgb, context.color.a),
})

const DestinationLight = createLightEffect({
  name: 'destinationLightBoundary',
  schema: { ambient: 0.25 },
  light: () => (context) => vec4(context.color.rgb, context.color.a),
})

const contextualLightStores: unknown[] = []
const ContextualLight = createLightEffect({
  name: 'contextualLightBoundary',
  schema: { ambient: 0.5 },
  light: ({ lightStore }) => {
    contextualLightStores.push(lightStore)
    return (context) => vec4(context.color.rgb, context.color.a)
  },
})

const InitialShadowLight = createLightEffect({
  name: 'initialShadowLightBoundary',
  schema: { ambient: 0.5 },
  needsShadows: true,
  light: () => (context) => vec4(context.color.rgb, context.color.a),
})

let builderReentryFlatland: Flatland | null = null
let builderReentryCandidate: InstanceType<typeof DestinationLight> | null = null
const ReentrantBuilderLight = createLightEffect({
  name: 'reentrantBuilderLightBoundary',
  schema: { ambient: 0.5 },
  light: () => {
    builderReentryFlatland?.setLighting(builderReentryCandidate)
    return (context) => vec4(context.color.rgb, context.color.a)
  },
})

let builderDisposeFlatland: Flatland | null = null
const DisposingBuilderLight = createLightEffect({
  name: 'disposingBuilderLightBoundary',
  schema: { ambient: 0.5 },
  light: () => {
    builderDisposeFlatland?.dispose()
    return (context) => vec4(context.color.rgb, context.color.a)
  },
})

let throwPassBuilder = true
const ThrowingPass = createPassEffect({
  name: 'throwingPassBoundary',
  schema: { amount: 0.75 },
  pass: () => {
    if (throwPassBuilder) throw new Error('pass builder failed')
    return (input) => input
  },
})

let throwLightBuilder = true
const ThrowingLight = createLightEffect({
  name: 'throwingLightBoundary',
  schema: { intensity: 0.75 },
  light: () => {
    if (throwLightBuilder) throw new Error('light builder failed')
    return (context) => vec4(context.color.rgb, context.color.a)
  },
})

function runtimeWorld(flatland: Flatland): World {
  return worldFor(flatland) as World
}

function numericTrait(instance: { constructor: unknown }): NumericTrait<NumericSchema> {
  return traitFor(instance.constructor as Function) as NumericTrait<NumericSchema>
}

function postPassGraph(flatland: Flatland): {
  readonly effects: PassEffect[]
  nextOrder: number
  readonly dirty: boolean
  project(): readonly PassEffectFn[] | null
} {
  return Reflect.get(flatland, '_postPassGraph')
}

describe('Flatland effect ownership boundaries', () => {
  it('atomically rejects adding a pass already owned by another Flatland', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const shared = new OwnedPass()
    const destinationPass = new OwnedPass()
    source.addPass(shared, 7)
    destination.addPass(destinationPass, 3)

    const sourceWorld = runtimeWorld(source)
    const destinationWorld = runtimeWorld(destination)
    const sharedEntity = entityFor(shared)!
    const destinationEntity = entityFor(destinationPass)!
    const sourceValue = sourceWorld.read(sharedEntity, numericTrait(shared))!.amount
    const destinationValue = destinationWorld.read(destinationEntity, numericTrait(destinationPass))!.amount
    const destinationGraph = postPassGraph(destination)
    const destinationNextOrder = destinationGraph.nextOrder

    expect(() => destination.addPass(shared, 11)).toThrow(/PassEffect is already attached to another Flatland/)

    expect(shared._flatland).toBe(source)
    expect(entityFor(shared)).toBe(sharedEntity)
    expect(shared._order).toBe(7)
    expect(shared._storeWorld).toBe(sourceWorld)
    expect(source.passes).toEqual([shared])
    expect(sourceWorld.isAlive(sharedEntity)).toBe(true)
    expect(sourceWorld.has(sharedEntity, numericTrait(shared))).toBe(true)
    expect(sourceWorld.read(sharedEntity, numericTrait(shared))!.amount).toBe(sourceValue)

    expect(destination.passes).toEqual([destinationPass])
    expect(destinationPass._flatland).toBe(destination)
    expect(entityFor(destinationPass)).toBe(destinationEntity)
    expect(destinationPass._order).toBe(3)
    expect(destinationPass._storeWorld).toBe(destinationWorld)
    expect(destinationWorld.isAlive(destinationEntity)).toBe(true)
    expect(destinationWorld.has(destinationEntity, numericTrait(destinationPass))).toBe(true)
    expect(destinationWorld.read(destinationEntity, numericTrait(destinationPass))!.amount).toBe(destinationValue)
    expect(postPassGraph(destination)).toBe(destinationGraph)
    expect(destinationGraph.nextOrder).toBe(destinationNextOrder)

    source.dispose()
    destination.dispose()
  })

  it('atomically rejects lighting already owned by another Flatland', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const shared = new SharedLight()
    const activeDestination = new DestinationLight()
    source.setLighting(shared)
    destination.setLighting(activeDestination)

    const sourceWorld = runtimeWorld(source)
    const destinationWorld = runtimeWorld(destination)
    const sharedEntity = entityFor(shared)!
    const destinationEntity = entityFor(activeDestination)!
    const sourceValue = sourceWorld.read(sharedEntity, numericTrait(shared))!.intensity
    const destinationValue = destinationWorld.read(destinationEntity, numericTrait(activeDestination))!.ambient
    const destinationContextEntity = Reflect.get(destination, '_lightingContextEntity')
    const destinationContext = destinationWorld.read(destinationContextEntity, LightingContext)!
    const destinationLightStore = Reflect.get(destination, '_lightStore')
    const destinationMaterials = Reflect.get(destination, '_spriteMaterials')
    const destinationLights = Reflect.get(destination, '_lights')
    const destinationMaterialMembers = [...destinationMaterials]
    const destinationLightMembers = [...destinationLights]
    const disposeDestination = vi.spyOn(activeDestination, 'dispose')

    expect(() => destination.setLighting(shared)).toThrow(/LightEffect is already attached to another Flatland/)

    expect(source.lighting).toBe(shared)
    expect(shared._flatland).toBe(source)
    expect(entityFor(shared)).toBe(sharedEntity)
    expect(shared._storeWorld).toBe(sourceWorld)
    expect(sourceWorld.isAlive(sharedEntity)).toBe(true)
    expect(sourceWorld.has(sharedEntity, LightEffectTrait)).toBe(true)
    expect(sourceWorld.has(sharedEntity, numericTrait(shared))).toBe(true)
    expect(sourceWorld.read(sharedEntity, numericTrait(shared))!.intensity).toBe(sourceValue)

    expect(destination.lighting).toBe(activeDestination)
    expect(disposeDestination).not.toHaveBeenCalled()
    expect(activeDestination._flatland).toBe(destination)
    expect(entityFor(activeDestination)).toBe(destinationEntity)
    expect(activeDestination._storeWorld).toBe(destinationWorld)
    expect(destinationWorld.isAlive(destinationEntity)).toBe(true)
    expect(destinationWorld.has(destinationEntity, LightEffectTrait)).toBe(true)
    expect(destinationWorld.has(destinationEntity, numericTrait(activeDestination))).toBe(true)
    expect(destinationWorld.read(destinationEntity, numericTrait(activeDestination))!.ambient).toBe(destinationValue)
    expect(Reflect.get(destination, '_lightingContextEntity')).toBe(destinationContextEntity)
    expect(destinationWorld.read(destinationContextEntity, LightingContext)).toBe(destinationContext)
    expect(destinationContext.effect).toBe(activeDestination)
    expect(Reflect.get(destination, '_lightStore')).toBe(destinationLightStore)
    expect(Reflect.get(destination, '_spriteMaterials')).toBe(destinationMaterials)
    expect(Reflect.get(destination, '_lights')).toBe(destinationLights)
    expect([...destinationMaterials]).toEqual(destinationMaterialMembers)
    expect([...destinationLights]).toEqual(destinationLightMembers)

    source.dispose()
    destination.dispose()
  })

  it('keeps pass publication unchanged when its user builder throws', () => {
    throwPassBuilder = true
    const flatland = new Flatland()
    const active = new OwnedPass()
    const replacement = new ThrowingPass()
    flatland.addPass(active, 4)

    const world = runtimeWorld(flatland)
    const activeEntity = entityFor(active)!
    const graph = postPassGraph(flatland)
    const nextOrder = graph.nextOrder

    expect(() => flatland.addPass(replacement)).toThrow('pass builder failed')

    expect(flatland.passes).toEqual([active])
    expect(active._flatland).toBe(flatland)
    expect(entityFor(active)).toBe(activeEntity)
    expect(world.isAlive(activeEntity)).toBe(true)
    expect(postPassGraph(flatland)).toBe(graph)
    expect(graph.effects).toEqual([active])
    expect(graph.nextOrder).toBe(nextOrder)
    expect(replacement._flatland).toBeNull()
    expect(entityFor(replacement)).toBeNull()
    expect(replacement._storeWorld).toBeNull()
    expect(replacement._passFn).toBeNull()
    expect(replacement._order).toBe(0)

    throwPassBuilder = false
    flatland.addPass(replacement)
    expect(flatland.passes).toEqual([active, replacement])
    expect(replacement._flatland).toBe(flatland)
    expect(entityFor(replacement)).not.toBeNull()

    flatland.dispose()
  })

  it('rolls back a provisional pass when ECS allocation fails and retries against the existing registry', () => {
    const flatland = new Flatland()
    const active = new OwnedPass()
    const replacement = new OwnedPass()
    flatland.addPass(active, 4)

    const world = runtimeWorld(flatland)
    const graph = postPassGraph(flatland)
    const nextOrder = graph.nextOrder
    const spawn = vi.spyOn(world, 'spawn').mockImplementationOnce(() => {
      throw new Error('pass entity capacity failed')
    })

    expect(() => flatland.addPass(replacement)).toThrow('pass entity capacity failed')

    expect(flatland.passes).toEqual([active])
    expect(postPassGraph(flatland)).toBe(graph)
    expect(graph.effects).toEqual([active])
    expect(graph.nextOrder).toBe(nextOrder)
    expect(world.isAlive(entityFor(active)!)).toBe(true)
    expect(replacement._flatland).toBeNull()
    expect(entityFor(replacement)).toBeNull()
    expect(replacement._storeWorld).toBeNull()
    expect(replacement._passFn).toBeNull()
    expect(replacement._order).toBe(0)

    spawn.mockRestore()
    flatland.addPass(replacement)
    expect(flatland.passes).toEqual([active, replacement])
    expect(replacement._flatland).toBe(flatland)
    expect(entityFor(replacement)).not.toBeNull()
    expect(world.isAlive(entityFor(replacement)!)).toBe(true)

    flatland.dispose()
  })

  it('keeps disposal terminal when a pass builder disposes its Flatland and leaves the pass reusable', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const sourceWorld = runtimeWorld(source)
    const replacement = new DisposingPass()
    passDisposeFlatland = source

    expect(() => source.addPass(replacement)).toThrow(/dispose\(\) cannot run reentrantly during addPass\(\)/)

    expect(sourceWorld.disposed).toBe(true)
    expect(Reflect.get(source.spriteGroup, '_world')).toBeNull()
    expect(Reflect.get(source, '_disposed')).toBe(true)
    expect(source.passes).toEqual([])
    expect(postPassGraph(source).effects).toEqual([])
    expect(replacement._flatland).toBeNull()
    expect(entityFor(replacement)).toBeNull()
    expect(replacement._storeWorld).toBeNull()
    expect(replacement._passFn).toBeNull()
    expect(() => source.addPass(new OwnedPass())).toThrow(/cannot run after Flatland\.dispose/)
    expect(() => source.setLighting(new DestinationLight())).toThrow(/cannot run after Flatland\.dispose/)
    expect(Reflect.get(source.spriteGroup, '_world')).toBeNull()

    passDisposeFlatland = null
    destination.addPass(replacement)
    expect(destination.passes).toEqual([replacement])
    expect(replacement._flatland).toBe(destination)
    expect(entityFor(replacement)).not.toBeNull()

    destination.dispose()
  })

  it('rejects core operations after a first-error-safe terminal dispose', () => {
    const flatland = new Flatland()
    const world = runtimeWorld(flatland)
    const disposeSpriteGroup = flatland.spriteGroup.dispose.bind(flatland.spriteGroup)
    const cleanupError = { source: 'SpriteGroup.dispose' }

    vi.spyOn(flatland.spriteGroup, 'dispose').mockImplementationOnce(() => {
      disposeSpriteGroup()
      throw cleanupError
    })

    let thrown: unknown
    try {
      flatland.dispose()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(cleanupError)
    expect(world.disposed).toBe(true)
    expect(Reflect.get(flatland.spriteGroup, '_world')).toBeNull()
    const candidate = new Sprite2D()
    expect(() => flatland.add(candidate)).toThrow('three-flatland: Flatland.add cannot be used after dispose()')
    expect(() => flatland.remove()).toThrow('three-flatland: Flatland.remove cannot be used after dispose()')
    expect(() => flatland.clear()).toThrow('three-flatland: Flatland.clear cannot be used after dispose()')
    expect(() => flatland.render(null as never)).toThrow(
      'three-flatland: Flatland.render cannot be used after dispose()'
    )
    expect(() => flatland.setRenderPipeline({} as never, {} as never)).toThrow(
      'three-flatland: Flatland.setRenderPipeline cannot be used after dispose()'
    )
    expect(() => flatland.clearRenderPipeline()).toThrow(
      'three-flatland: Flatland.clearRenderPipeline cannot be used after dispose()'
    )
    expect(() => flatland.addPass(new OwnedPass())).toThrow(
      'three-flatland: addPass() cannot run after Flatland.dispose()'
    )
    expect(() => flatland.removePass(new OwnedPass())).toThrow(
      'three-flatland: Flatland.removePass cannot be used after dispose()'
    )
    expect(() => flatland.clearPasses()).toThrow('three-flatland: Flatland.clearPasses cannot be used after dispose()')
    expect(() => flatland.resize(1, 1)).toThrow('three-flatland: Flatland.resize cannot be used after dispose()')
    expect(() => {
      flatland.viewSize = flatland.viewSize
    }).toThrow('three-flatland: Flatland.viewSize cannot be used after dispose()')
    expect(flatland.renderPipeline).toBeNull()
    expect(() => flatland.dispose()).not.toThrow()
    expect(Reflect.get(flatland.spriteGroup, '_world')).toBeNull()
    candidate.dispose()
  })

  it('rejects direct disposal of an owned SpriteGroup before any child or parent mutation', () => {
    const flatland = new Flatland()
    const child = new Group()
    const sceneChildren = flatland.scene.children.slice()

    expect(() => flatland.spriteGroup.dispose()).toThrow(
      'three-flatland: Flatland.spriteGroup.dispose() cannot run while its Flatland is live; call Flatland.dispose() instead'
    )
    expect(Reflect.get(flatland.spriteGroup, '_disposed')).toBe(false)
    expect(flatland.scene.children).toEqual(sceneChildren)
    expect(() => flatland.add(child)).not.toThrow()
    expect(child.parent).toBe(flatland.scene)
    expect(() => flatland.clear()).not.toThrow()
    expect(child.parent).toBeNull()
    expect(() => flatland.dispose()).not.toThrow()
    expect(() => flatland.dispose()).not.toThrow()
  })

  it('publishes parent terminal state before owned SpriteGroup cleanup callbacks', () => {
    const flatland = new Flatland()
    const trigger = new Group()
    const candidate = new Group()
    flatland.spriteGroup.add(trigger)
    trigger.addEventListener('removed', () => {
      expect(() => flatland.add(candidate)).toThrow('cannot be used after dispose()')
      expect(() => flatland.setRenderPipeline({} as never, {} as never)).toThrow('cannot be used after dispose()')
    })

    flatland.dispose()

    expect(candidate.parent).toBeNull()
    expect(flatland.scene.children).toEqual([flatland.spriteGroup])
    expect(flatland.renderPipeline).toBeNull()
  })

  it('rejects same-pass addPass reentry before allocating an entity or publishing graph membership', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const sourceWorld = runtimeWorld(source)
    const pass = new ReentrantPass()
    samePassFlatland = source
    samePassCandidate = pass

    expect(() => source.addPass(pass)).toThrow(/addPass\(\) cannot run reentrantly on the same Flatland/)

    expect(source.passes).toEqual([])
    expect(postPassGraph(source).effects).toEqual([])
    expect(pass._flatland).toBeNull()
    expect(entityFor(pass)).toBeNull()
    expect(pass._storeWorld).toBeNull()
    expect(pass._passFn).toBeNull()

    samePassFlatland = null
    samePassCandidate = null
    destination.addPass(pass)
    expect(destination.passes).toEqual([pass])
    expect(pass._flatland).toBe(destination)
    expect(entityFor(pass)).not.toBeNull()

    source.dispose()
    destination.dispose()
  })

  it('rejects cross-Flatland attachment from a pass builder and publishes only on a clean retry', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const sourceWorld = runtimeWorld(source)
    const pass = new CrossFlatlandPass()
    crossPassFlatland = destination
    crossPassCandidate = pass

    expect(() => source.addPass(pass)).toThrow(/PassEffect is already being prepared by another Flatland/)

    for (const flatland of [source, destination]) {
      expect(flatland.passes).toEqual([])
      expect(postPassGraph(flatland).effects).toEqual([])
    }
    expect(pass._flatland).toBeNull()
    expect(entityFor(pass)).toBeNull()
    expect(pass._storeWorld).toBeNull()
    expect(pass._passFn).toBeNull()

    crossPassFlatland = null
    crossPassCandidate = null
    source.addPass(pass)
    expect(source.passes).toEqual([pass])
    expect(pass._flatland).toBe(source)
    expect(entityFor(pass)).not.toBeNull()
    expect(sourceWorld.isAlive(entityFor(pass)!)).toBe(true)
    expect(sourceWorld.has(entityFor(pass)!, numericTrait(pass))).toBe(true)
    expect(postPassGraph(source).effects).toEqual([pass])
    expect(postPassGraph(destination).effects).toEqual([])

    source.dispose()
    destination.dispose()
  })

  it('keeps active lighting unchanged when the replacement builder throws', () => {
    throwLightBuilder = true
    const flatland = new Flatland()
    const active = new DestinationLight()
    const replacement = new ThrowingLight()
    flatland.setLighting(active)

    const world = runtimeWorld(flatland)
    const activeEntity = entityFor(active)!
    const contextEntity = Reflect.get(flatland, '_lightingContextEntity')
    const context = world.read(contextEntity, LightingContext)!
    const lightStore = Reflect.get(flatland, '_lightStore')
    const shadowPipelineEntity = Reflect.get(flatland, '_shadowPipelineEntity')
    const disposeActive = vi.spyOn(active, 'dispose')

    expect(() => flatland.setLighting(replacement)).toThrow('light builder failed')

    expect(flatland.lighting).toBe(active)
    expect(disposeActive).not.toHaveBeenCalled()
    expect(active._flatland).toBe(flatland)
    expect(entityFor(active)).toBe(activeEntity)
    expect(world.isAlive(activeEntity)).toBe(true)
    expect(world.has(activeEntity, LightEffectTrait)).toBe(true)
    expect(Reflect.get(flatland, '_lightingContextEntity')).toBe(contextEntity)
    expect(world.read(contextEntity, LightingContext)).toBe(context)
    expect(context.effect).toBe(active)
    expect(Reflect.get(flatland, '_lightStore')).toBe(lightStore)
    expect(Reflect.get(flatland, '_shadowPipelineEntity')).toBe(shadowPipelineEntity)
    expect(replacement._flatland).toBeNull()
    expect(entityFor(replacement)).toBeNull()
    expect(replacement._storeWorld).toBeNull()
    expect(replacement._lightFn).toBeNull()

    throwLightBuilder = false
    flatland.setLighting(replacement)
    expect(flatland.lighting).toBe(replacement)
    expect(replacement._flatland).toBe(flatland)
    expect(entityFor(replacement)).not.toBeNull()
    expect(disposeActive).toHaveBeenCalledTimes(1)

    flatland.dispose()
  })

  it('rolls back every provisional lighting resource when initial ECS allocation fails and retries', () => {
    const flatland = new Flatland()
    const replacement = new InitialShadowLight()
    const world = runtimeWorld(flatland)
    const originalSpawn = world.spawn.bind(world) as World['spawn']
    let spawnCalls = 0
    const spawn = vi.spyOn(world, 'spawn').mockImplementation((...traits) => {
      spawnCalls++
      if (spawnCalls === 3) throw new Error('lighting context capacity failed')
      return originalSpawn(...traits)
    })

    expect(() => flatland.setLighting(replacement)).toThrow('lighting context capacity failed')

    expect(flatland.lighting).toBeNull()
    expect(Reflect.get(flatland, '_lightStore')).toBeNull()
    expect(Reflect.get(flatland, '_shadowPipelineEntity')).toBeNull()
    expect(Reflect.get(flatland, '_lightingContextEntity')).toBeNull()
    expect([...world.view(select(LightEffectTrait))]).toEqual([])
    expect([...world.view(select(ShadowPipeline))]).toEqual([])
    expect([...world.view(select(LightingContext))]).toEqual([])
    expect(replacement._flatland).toBeNull()
    expect(entityFor(replacement)).toBeNull()
    expect(replacement._storeWorld).toBeNull()
    expect(replacement._lightFn).toBeNull()

    spawn.mockRestore()
    flatland.setLighting(replacement)
    expect(flatland.lighting).toBe(replacement)
    expect(replacement._flatland).toBe(flatland)
    expect(entityFor(replacement)).not.toBeNull()
    expect(world.isAlive(entityFor(replacement)!)).toBe(true)
    expect([...world.view(select(ShadowPipeline))]).toHaveLength(1)
    expect([...world.view(select(LightingContext))]).toHaveLength(1)

    flatland.dispose()
  })

  it('clears a prepared replacement after a falsy old-light disposal failure so another Flatland rebuilds it', () => {
    contextualLightStores.length = 0
    const source = new Flatland()
    const destination = new Flatland()
    const active = new DestinationLight()
    const replacement = new ContextualLight()
    source.setLighting(active)

    const sourceWorld = runtimeWorld(source)
    const activeEntity = entityFor(active)!
    const sourceContextEntity = Reflect.get(source, '_lightingContextEntity')
    const sourceContext = sourceWorld.read(sourceContextEntity, LightingContext)!
    const sourceStore = Reflect.get(source, '_lightStore')
    active.dispose = vi.fn(() => {
      throw 0
    })

    let didThrow = false
    let thrown: unknown
    try {
      source.setLighting(replacement)
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(source.lighting).toBe(active)
    expect(active._flatland).toBe(source)
    expect(entityFor(active)).toBe(activeEntity)
    expect(sourceWorld.isAlive(activeEntity)).toBe(true)
    expect(Reflect.get(source, '_lightingContextEntity')).toBe(sourceContextEntity)
    expect(sourceWorld.read(sourceContextEntity, LightingContext)).toBe(sourceContext)
    expect(sourceContext.effect).toBe(active)
    expect(Reflect.get(source, '_lightStore')).toBe(sourceStore)
    expect([...sourceWorld.view(select(LightEffectTrait))]).toEqual([activeEntity])
    expect([...sourceWorld.view(select(ShadowPipeline))]).toHaveLength(1)
    expect([...sourceWorld.view(select(LightingContext))]).toHaveLength(1)
    expect(replacement._flatland).toBeNull()
    expect(entityFor(replacement)).toBeNull()
    expect(replacement._storeWorld).toBeNull()
    expect(replacement._lightFn).toBeNull()
    expect(contextualLightStores).toEqual([sourceStore])

    destination.setLighting(replacement)
    const destinationStore = Reflect.get(destination, '_lightStore')
    expect(contextualLightStores).toEqual([sourceStore, destinationStore])
    expect(destinationStore).not.toBe(sourceStore)
    expect(destination.lighting).toBe(replacement)
    expect(replacement._flatland).toBe(destination)
    expect(replacement._storeWorld).toBe(runtimeWorld(destination))

    active.dispose = vi.fn()
    source.dispose()
    destination.dispose()
  })

  it('rejects setLighting reentry from a replacement builder without publishing either candidate', () => {
    const source = new Flatland()
    const firstDestination = new Flatland()
    const secondDestination = new Flatland()
    const active = new DestinationLight()
    const outer = new ReentrantBuilderLight()
    const inner = new DestinationLight()
    source.setLighting(active)

    const sourceWorld = runtimeWorld(source)
    const activeEntity = entityFor(active)!
    const sourceContextEntity = Reflect.get(source, '_lightingContextEntity')
    const sourceContext = sourceWorld.read(sourceContextEntity, LightingContext)!
    builderReentryFlatland = source
    builderReentryCandidate = inner

    expect(() => source.setLighting(outer)).toThrow(/setLighting\(\) cannot run reentrantly/)

    expect(source.lighting).toBe(active)
    expect(active._flatland).toBe(source)
    expect(entityFor(active)).toBe(activeEntity)
    expect(sourceWorld.isAlive(activeEntity)).toBe(true)
    expect(sourceWorld.read(sourceContextEntity, LightingContext)).toBe(sourceContext)
    expect(sourceContext.effect).toBe(active)
    expect([...sourceWorld.view(select(LightEffectTrait))]).toEqual([activeEntity])
    for (const candidate of [outer, inner]) {
      expect(candidate._flatland).toBeNull()
      expect(entityFor(candidate)).toBeNull()
      expect(candidate._storeWorld).toBeNull()
      expect(candidate._lightFn).toBeNull()
    }

    builderReentryFlatland = null
    builderReentryCandidate = null
    firstDestination.setLighting(outer)
    secondDestination.setLighting(inner)
    expect(firstDestination.lighting).toBe(outer)
    expect(secondDestination.lighting).toBe(inner)

    source.dispose()
    firstDestination.dispose()
    secondDestination.dispose()
  })

  it('rejects setLighting reentry from old-light disposal without stranding the outer or inner candidate', () => {
    const source = new Flatland()
    const firstDestination = new Flatland()
    const secondDestination = new Flatland()
    const active = new DestinationLight()
    const outer = new ContextualLight()
    const inner = new DestinationLight()
    source.setLighting(active)

    const sourceWorld = runtimeWorld(source)
    const activeEntity = entityFor(active)!
    const sourceContextEntity = Reflect.get(source, '_lightingContextEntity')
    const sourceContext = sourceWorld.read(sourceContextEntity, LightingContext)!
    active.dispose = vi.fn(() => {
      source.setLighting(inner)
    })

    expect(() => source.setLighting(outer)).toThrow(/setLighting\(\) cannot run reentrantly/)

    expect(source.lighting).toBe(active)
    expect(active._flatland).toBe(source)
    expect(entityFor(active)).toBe(activeEntity)
    expect(sourceWorld.isAlive(activeEntity)).toBe(true)
    expect(sourceWorld.read(sourceContextEntity, LightingContext)).toBe(sourceContext)
    expect(sourceContext.effect).toBe(active)
    expect([...sourceWorld.view(select(LightEffectTrait))]).toEqual([activeEntity])
    for (const candidate of [outer, inner]) {
      expect(candidate._flatland).toBeNull()
      expect(entityFor(candidate)).toBeNull()
      expect(candidate._storeWorld).toBeNull()
      expect(candidate._lightFn).toBeNull()
    }

    active.dispose = vi.fn()
    firstDestination.setLighting(outer)
    secondDestination.setLighting(inner)
    expect(firstDestination.lighting).toBe(outer)
    expect(secondDestination.lighting).toBe(inner)

    source.dispose()
    firstDestination.dispose()
    secondDestination.dispose()
  })

  it('rolls back a lighting replacement when old-light disposal tries to dispose its owned SpriteGroup', () => {
    const flatland = new Flatland()
    const active = new DestinationLight()
    const replacement = new ContextualLight()
    flatland.setLighting(active)
    const world = runtimeWorld(flatland)
    const activeEntity = entityFor(active)
    active.dispose = vi.fn(() => {
      flatland.spriteGroup.dispose()
    })

    expect(() => flatland.setLighting(replacement)).toThrow(
      'three-flatland: Flatland.spriteGroup.dispose() cannot run while its Flatland is live; call Flatland.dispose() instead'
    )

    expect(world.disposed).toBe(false)
    expect(flatland.lighting).toBe(active)
    expect(active._flatland).toBe(flatland)
    expect(entityFor(active)).toBe(activeEntity)
    expect(world.isAlive(activeEntity!)).toBe(true)
    expect(replacement._flatland).toBeNull()
    expect(entityFor(replacement)).toBeNull()
    expect(replacement._storeWorld).toBeNull()
    expect(replacement._lightFn).toBeNull()
    const child = new Group()
    expect(() => flatland.add(child)).not.toThrow()
    expect(child.parent).toBe(flatland.scene)
    expect(() => flatland.dispose()).not.toThrow()
    expect(world.disposed).toBe(true)
    expect(flatland.lighting).toBeNull()
    expect(active._flatland).toBeNull()
    expect(entityFor(active)).toBeNull()
  })

  it('keeps active lighting authoritative when clear-light disposal tries to dispose its owned SpriteGroup', () => {
    const flatland = new Flatland()
    const active = new DestinationLight()
    flatland.setLighting(active)
    const world = runtimeWorld(flatland)
    const activeEntity = entityFor(active)
    active.dispose = vi.fn(() => {
      flatland.spriteGroup.dispose()
    })

    expect(() => flatland.setLighting(null)).toThrow('call Flatland.dispose() instead')

    expect(world.disposed).toBe(false)
    expect(flatland.lighting).toBe(active)
    expect(active._flatland).toBe(flatland)
    expect(entityFor(active)).toBe(activeEntity)
    expect(world.isAlive(activeEntity!)).toBe(true)
    expect(() => flatland.dispose()).not.toThrow()
    expect(world.disposed).toBe(true)
  })

  it('rejects Flatland disposal from a lighting builder before any terminal mutation', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const active = new DestinationLight()
    const replacement = new DisposingBuilderLight()
    source.setLighting(active)

    const sourceWorld = runtimeWorld(source)
    const activeEntity = entityFor(active)!
    const sourceContextEntity = Reflect.get(source, '_lightingContextEntity')
    builderDisposeFlatland = source

    expect(() => source.setLighting(replacement)).toThrow(/dispose\(\) cannot run reentrantly/)

    expect(source.lighting).toBe(active)
    expect(active._flatland).toBe(source)
    expect(entityFor(active)).toBe(activeEntity)
    expect(sourceWorld.isAlive(activeEntity)).toBe(true)
    expect(sourceWorld.read(sourceContextEntity, LightingContext)!.effect).toBe(active)
    expect([...sourceWorld.view(select(LightEffectTrait))]).toEqual([activeEntity])
    expect(replacement._flatland).toBeNull()
    expect(entityFor(replacement)).toBeNull()
    expect(replacement._storeWorld).toBeNull()
    expect(replacement._lightFn).toBeNull()

    builderDisposeFlatland = null
    destination.setLighting(replacement)
    expect(destination.lighting).toBe(replacement)

    source.dispose()
    destination.dispose()
  })

  it('preserves a falsy lighting failure while completing every later disposal', () => {
    const flatland = new Flatland()
    const pass = new OwnedPass()
    const light = new DestinationLight()
    flatland.addPass(pass)
    flatland.setLighting(light)

    const world = runtimeWorld(flatland)
    const disposePipeline = vi.fn()
    Reflect.set(flatland, '_renderPipeline', { dispose: disposePipeline })
    light.dispose = vi.fn(() => {
      throw 0
    })

    let didThrow = false
    let thrown: unknown
    try {
      flatland.dispose()
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(flatland.passes).toEqual([])
    expect(pass._flatland).toBeNull()
    expect(entityFor(pass)).toBeNull()
    expect(flatland.lighting).toBeNull()
    expect(light._flatland).toBeNull()
    expect(entityFor(light)).toBeNull()
    expect(postPassGraph(flatland).effects).toEqual([])
    expect(Reflect.get(flatland, '_lightingContextEntity')).toBeNull()
    expect(Reflect.get(flatland, '_lightStore')).toBeNull()
    expect(Reflect.get(flatland, '_shadowPipelineEntity')).toBeNull()
    expect(Reflect.get(flatland, '_renderPipeline')).toBeNull()
    expect(Reflect.get(flatland, '_passNode')).toBeNull()
    expect(Reflect.get(flatland, '_outputNode')).toBeNull()
    expect(disposePipeline).toHaveBeenCalledTimes(1)
    expect(world.disposed).toBe(true)
    expect(Reflect.get(flatland.spriteGroup, '_world')).toBeNull()
  })

  it('releases snapshotted shadow resources when light cleanup disposes the shared world', () => {
    const flatland = new Flatland()
    const light = new InitialShadowLight()
    flatland.setLighting(light)

    const world = runtimeWorld(flatland)
    const shadowEntity = Reflect.get(flatland, '_shadowPipelineEntity')
    const pipeline = world.read(shadowEntity, ShadowPipeline)!
    const disposeSdf = vi.spyOn(pipeline.sdfGenerator!, 'dispose')
    const disposeOcclusion = vi.spyOn(pipeline.occlusionPass!, 'dispose')
    const disposePipeline = vi.fn()
    Reflect.set(flatland, '_renderPipeline', { dispose: disposePipeline })
    light.dispose = vi.fn(() => {
      flatland.spriteGroup.dispose()
      throw 0
    })

    let didThrow = false
    let thrown: unknown
    try {
      flatland.dispose()
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(world.disposed).toBe(true)
    expect(disposeSdf).toHaveBeenCalledOnce()
    expect(disposeOcclusion).toHaveBeenCalledOnce()
    expect(disposePipeline).toHaveBeenCalledOnce()
    expect(flatland.lighting).toBeNull()
    expect(light._flatland).toBeNull()
    expect(entityFor(light)).toBeNull()
    expect(Reflect.get(flatland, '_lightingContextEntity')).toBeNull()
    expect(Reflect.get(flatland, '_shadowPipelineEntity')).toBeNull()
    expect(Reflect.get(flatland, '_shadowSdfGenerator')).toBeNull()
    expect(Reflect.get(flatland, '_shadowOcclusionPass')).toBeNull()
    expect(Reflect.get(flatland, '_sharedWorld')).toBeNull()
    expect(Reflect.get(flatland.spriteGroup, '_world')).toBeNull()
    expect(() => flatland.dispose()).not.toThrow()
  })

  it('revokes shadow allocation eligibility before user light cleanup runs', () => {
    const flatland = new Flatland()
    const light = new InitialShadowLight()
    flatland.setLighting(light)
    const init = vi.spyOn(light, 'init')
    const resize = vi.spyOn(light, 'resize')
    const update = vi.spyOn(light, 'update')

    const world = runtimeWorld(flatland)
    const contextEntity = Reflect.get(flatland, '_lightingContextEntity')
    const context = world.read(contextEntity, LightingContext)!
    context.renderer = {} as never
    context.camera = flatland.camera
    context.surfaceSize.set(256, 256)
    context.scene = null
    const shadowEntity = Reflect.get(flatland, '_shadowPipelineEntity')
    const pipeline = world.read(shadowEntity, ShadowPipeline)!
    const disposeSdf = vi.spyOn(pipeline.sdfGenerator!, 'dispose')
    const disposeOcclusion = vi.spyOn(pipeline.occlusionPass!, 'dispose')
    let replacementSdf: unknown = null
    let replacementOcclusion: unknown = null
    light.dispose = vi.fn(() => {
      flatland.spriteGroup.update()
      shadowPipelineSystem(world)
      replacementSdf = pipeline.sdfGenerator
      replacementOcclusion = pipeline.occlusionPass
    })

    flatland.dispose()

    expect(replacementSdf).toBeNull()
    expect(replacementOcclusion).toBeNull()
    expect(init).not.toHaveBeenCalled()
    expect(resize).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(disposeSdf).toHaveBeenCalledOnce()
    expect(disposeOcclusion).toHaveBeenCalledOnce()
    expect(world.disposed).toBe(true)
    expect(() => flatland.dispose()).not.toThrow()
  })

  it('suspends old lighting during replacement disposal and restores it after rollback', () => {
    const flatland = new Flatland()
    const active = new DestinationLight()
    const replacement = new ContextualLight()
    flatland.setLighting(active)

    const world = runtimeWorld(flatland)
    const contextEntity = Reflect.get(flatland, '_lightingContextEntity')
    const context = world.read(contextEntity, LightingContext)!
    const renderer = {} as never
    context.renderer = renderer
    context.camera = flatland.camera
    context.surfaceSize.set(256, 256)
    context.scene = flatland.scene
    const init = vi.spyOn(active, 'init')
    const resize = vi.spyOn(active, 'resize')
    const update = vi.spyOn(active, 'update')
    let failDisposal = true
    active.dispose = vi.fn(() => {
      flatland.spriteGroup.update()
      if (failDisposal) throw 0
    })

    let didThrow = false
    let thrown: unknown
    try {
      flatland.setLighting(replacement)
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(init).not.toHaveBeenCalled()
    expect(resize).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(flatland.lighting).toBe(active)
    expect(world.read(contextEntity, LightingContext)).toBe(context)
    expect(context.effect).toBe(active)
    expect(context.renderer).toBe(renderer)

    flatland.spriteGroup.update()
    expect(init).toHaveBeenCalledOnce()
    expect(resize).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()

    failDisposal = false
    flatland.setLighting(replacement)
    expect(init).toHaveBeenCalledOnce()
    expect(resize).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()
    expect(flatland.lighting).toBe(replacement)
    expect(context.effect).toBe(replacement)
    expect(context.renderer).toBe(renderer)

    flatland.dispose()
  })

  it('keeps old lighting suspended while discarding a failed shadow candidate', () => {
    const flatland = new Flatland()
    const active = new DestinationLight()
    let candidateDisposeCallbackRuns = 0
    const FailedShadowCandidate = createLightEffect({
      name: 'failedShadowCandidateBoundary',
      schema: {} as const,
      needsShadows: true,
      light: ({ sdfTexture }) => {
        sdfTexture!.renderTarget!.addEventListener('dispose', () => {
          candidateDisposeCallbackRuns++
          flatland.spriteGroup.update()
        })
        return (context) => vec4(context.color.rgb, context.color.a)
      },
    })
    const replacement = new FailedShadowCandidate()
    flatland.setLighting(active)

    const world = runtimeWorld(flatland)
    const contextEntity = Reflect.get(flatland, '_lightingContextEntity')
    const context = world.read(contextEntity, LightingContext)!
    context.renderer = {} as never
    context.camera = flatland.camera
    context.surfaceSize.set(256, 256)
    context.scene = flatland.scene
    const init = vi.spyOn(active, 'init')
    const resize = vi.spyOn(active, 'resize')
    const update = vi.spyOn(active, 'update')
    active.dispose = vi.fn(() => {
      throw 0
    })

    let didThrow = false
    let thrown: unknown
    try {
      flatland.setLighting(replacement)
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(candidateDisposeCallbackRuns).toBe(1)
    expect(init).not.toHaveBeenCalled()
    expect(resize).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(flatland.lighting).toBe(active)
    expect(context.effect).toBe(active)
    expect(replacement._flatland).toBeNull()
    expect(entityFor(replacement)).toBeNull()

    flatland.spriteGroup.update()
    expect(init).toHaveBeenCalledOnce()
    expect(resize).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()

    active.dispose = vi.fn()
    flatland.dispose()
  })

  it('preserves the live shadow generation across replacement disposal callbacks', () => {
    const flatland = new Flatland()
    const active = new InitialShadowLight()
    const replacement = new InitialShadowLight()
    flatland.setLighting(active)

    const world = runtimeWorld(flatland)
    const shadowEntity = Reflect.get(flatland, '_shadowPipelineEntity')
    const pipeline = world.read(shadowEntity, ShadowPipeline)!
    const sdfGenerator = pipeline.sdfGenerator
    const occlusionPass = pipeline.occlusionPass
    const disposeSdf = vi.spyOn(sdfGenerator!, 'dispose')
    const disposeOcclusion = vi.spyOn(occlusionPass!, 'dispose')
    active.dispose = vi.fn(() => {
      shadowPipelineSystem(world)
    })

    flatland.setLighting(replacement)

    expect(pipeline.sdfGenerator).toBe(sdfGenerator)
    expect(pipeline.occlusionPass).toBe(occlusionPass)
    expect(disposeSdf).not.toHaveBeenCalled()
    expect(disposeOcclusion).not.toHaveBeenCalled()
    expect(flatland.lighting).toBe(replacement)

    flatland.dispose()
    expect(disposeSdf).toHaveBeenCalledOnce()
    expect(disposeOcclusion).toHaveBeenCalledOnce()
  })

  it('retains shadow ownership when direct SpriteGroup disposal is rejected', () => {
    const flatland = new Flatland()
    const light = new InitialShadowLight()
    flatland.setLighting(light)

    const world = runtimeWorld(flatland)
    const shadowEntity = Reflect.get(flatland, '_shadowPipelineEntity')
    const pipeline = world.read(shadowEntity, ShadowPipeline)!
    const disposeSdf = vi.spyOn(pipeline.sdfGenerator!, 'dispose')
    const disposeOcclusion = vi.spyOn(pipeline.occlusionPass!, 'dispose')
    const disposePipeline = vi.fn()
    Reflect.set(flatland, '_renderPipeline', { dispose: disposePipeline })

    expect(() => flatland.spriteGroup.dispose()).toThrow(
      'three-flatland: Flatland.spriteGroup.dispose() cannot run while its Flatland is live; call Flatland.dispose() instead'
    )

    expect(world.disposed).toBe(false)
    expect(disposeSdf).not.toHaveBeenCalled()
    expect(disposeOcclusion).not.toHaveBeenCalled()
    expect(() => flatland.dispose()).not.toThrow()
    expect(world.disposed).toBe(true)
    expect(disposeSdf).toHaveBeenCalledOnce()
    expect(disposeOcclusion).toHaveBeenCalledOnce()
    expect(disposePipeline).toHaveBeenCalledOnce()
    expect(flatland.lighting).toBeNull()
    expect(light._flatland).toBeNull()
    expect(entityFor(light)).toBeNull()
    expect(Reflect.get(flatland, '_lightingContextEntity')).toBeNull()
    expect(Reflect.get(flatland, '_shadowPipelineEntity')).toBeNull()
    expect(Reflect.get(flatland, '_shadowSdfGenerator')).toBeNull()
    expect(Reflect.get(flatland, '_shadowOcclusionPass')).toBeNull()
    expect(Reflect.get(flatland, '_sharedWorld')).toBeNull()
    expect(Reflect.get(flatland.spriteGroup, '_world')).toBeNull()
    expect(() => flatland.dispose()).not.toThrow()
  })

  it('disposes the render pipeline after SpriteGroup disposal reports an error', () => {
    const flatland = new Flatland()
    const world = runtimeWorld(flatland)
    const disposePipeline = vi.fn()
    Reflect.set(flatland, '_renderPipeline', { dispose: disposePipeline })
    const disposeGroup = flatland.spriteGroup.dispose.bind(flatland.spriteGroup)
    vi.spyOn(flatland.spriteGroup, 'dispose').mockImplementation(() => {
      disposeGroup()
      throw new Error('sprite group disposal failed')
    })

    expect(() => flatland.dispose()).toThrow('sprite group disposal failed')

    expect(world.disposed).toBe(true)
    expect(Reflect.get(flatland.spriteGroup, '_world')).toBeNull()
    expect(disposePipeline).toHaveBeenCalledTimes(1)
    expect(Reflect.get(flatland, '_renderPipeline')).toBeNull()
    expect(Reflect.get(flatland, '_autoRenderPipeline')).toBe(false)
  })
})

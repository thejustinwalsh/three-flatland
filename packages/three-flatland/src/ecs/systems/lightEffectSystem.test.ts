import { worldFor } from '../testUtils.type-test'
import { OrthographicCamera, Scene, Vector2 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorld, type World } from '../runtime'
import { LightingContext } from '../traits'
import type { Light2D } from '../../lights/Light2D'
import type { LightEffect, LightEffectRuntimeContext } from '../../lights/LightEffect'
import type { LightStore } from '../../lights/LightStore'
import type { WebGPURenderer } from 'three/webgpu'
import { SpriteGroup } from '../../pipeline/SpriteGroup'
import { lightEffectRenderSystem, lightEffectSystem, releaseLightEffectRuntimeContext } from './lightEffectSystem'

interface RuntimeFixture {
  camera: OrthographicCamera
  renderer: WebGPURenderer
  scene: Scene
  lightStore: LightStore
  lights: Light2D[]
  worldSize: Vector2
  worldOffset: Vector2
}

const worlds: World[] = []

function makeEffect(hooks: {
  init?: (context: LightEffectRuntimeContext) => void
  update?: (context: LightEffectRuntimeContext) => void
}): LightEffect {
  return {
    enabled: true,
    _initialized: false,
    init: vi.fn(hooks.init),
    resize: vi.fn(),
    update: vi.fn(hooks.update),
  } as unknown as LightEffect
}

function makeWorld(effect: LightEffect, camera: OrthographicCamera, label: string): [World, RuntimeFixture] {
  const world = createWorld()
  worlds.push(world)
  const renderer = { label } as unknown as WebGPURenderer
  const scene = new Scene()
  const lightStore = { label } as unknown as LightStore
  const lights = [{ label }] as unknown as Light2D[]
  const worldSize = new Vector2()
  const worldOffset = new Vector2()
  world.spawn(
    LightingContext({
      effect,
      lightStore,
      lights,
      renderer,
      camera,
      scene,
      surfaceSize: new Vector2(320, 180),
      worldSize,
      worldOffset,
    })
  )
  return [world, { camera, renderer, scene, lightStore, lights, worldSize, worldOffset }]
}

function expectRuntimeContext(context: LightEffectRuntimeContext, fixture: RuntimeFixture): void {
  expect(context.renderer).toBe(fixture.renderer)
  expect(context.camera).toBe(fixture.camera)
  expect(context.scene).toBe(fixture.scene)
  expect(context.lightStore).toBe(fixture.lightStore)
  expect(context.lights).toBe(fixture.lights)
  expect(context.worldSize).toBe(fixture.worldSize)
  expect(context.worldOffset).toBe(fixture.worldOffset)
}

afterEach(() => {
  for (const world of worlds.splice(0)) {
    releaseLightEffectRuntimeContext(world)
    world.dispose()
  }
})

describe('lightEffectSystem runtime context', () => {
  it('includes a translated camera position in lighting world bounds', () => {
    const camera = new OrthographicCamera(-20, 20, 30, -10)
    camera.position.set(120, -45, 100)
    const effect = makeEffect({})
    const [world, fixture] = makeWorld(effect, camera, 'translated-camera')

    lightEffectSystem(world)

    expect(fixture.worldSize.toArray()).toEqual([40, 40])
    expect(fixture.worldOffset.toArray()).toEqual([100, -55])
  })

  it('preserves each world context across nested init and update renders without per-frame allocation', () => {
    const contextsA: LightEffectRuntimeContext[] = []
    const contextsB: LightEffectRuntimeContext[] = []
    const cameraA = new OrthographicCamera(-10, 30, 20, -20)
    const cameraB = new OrthographicCamera(100, 180, 60, 20)

    const effectB = makeEffect({
      init: (context) => contextsB.push(context),
      update: (context) => contextsB.push(context),
    })
    const [worldB, fixtureB] = makeWorld(effectB, cameraB, 'B')

    let fixtureA!: RuntimeFixture
    const assertAAfterNestedRender = (context: LightEffectRuntimeContext): void => {
      contextsA.push(context)
      expectRuntimeContext(context, fixtureA)
      lightEffectSystem(worldB)
      expectRuntimeContext(context, fixtureA)
      expect(context).not.toBe(contextsB[0])
    }
    const effectA = makeEffect({
      init: assertAAfterNestedRender,
      update: assertAAfterNestedRender,
    })
    const [worldA, createdFixtureA] = makeWorld(effectA, cameraA, 'A')
    fixtureA = createdFixtureA

    lightEffectSystem(worldA)
    lightEffectSystem(worldA)

    expect(new Set(contextsA).size).toBe(1)
    expect(new Set(contextsB).size).toBe(1)
    expectRuntimeContext(contextsA[0]!, fixtureA)
    expectRuntimeContext(contextsB[0]!, fixtureB)
    expect(fixtureA.worldSize.toArray()).toEqual([40, 40])
    expect(fixtureA.worldOffset.toArray()).toEqual([-10, -20])
    expect(fixtureB.worldSize.toArray()).toEqual([80, 40])
    expect(fixtureB.worldOffset.toArray()).toEqual([100, 20])
  })

  it('releases renderer-bearing context when a SpriteGroup is disposed even if its world handle is retained', () => {
    const group = new SpriteGroup()
    const world = worldFor(group)
    const camera = new OrthographicCamera(-10, 10, 10, -10)
    const contexts: LightEffectRuntimeContext[] = []
    const effect = makeEffect({ update: (context) => contexts.push(context) })
    const renderer = { label: 'retained-world' } as unknown as WebGPURenderer
    const scene = new Scene()
    world.spawn(
      LightingContext({
        effect,
        lightStore: { label: 'retained-world' } as unknown as LightStore,
        lights: [],
        renderer,
        camera,
        scene,
        surfaceSize: new Vector2(320, 180),
        worldSize: new Vector2(),
        worldOffset: new Vector2(),
      })
    )
    lightEffectSystem(world)
    lightEffectRenderSystem(world)
    expect(contexts[0]!.renderer).toBe(renderer)

    group.dispose()

    // The retained world is still strongly reachable here. A false result
    // proves SpriteGroup.dispose() already removed its renderer-bearing entry.
    expect(releaseLightEffectRuntimeContext(world)).toBe(false)
  })
})

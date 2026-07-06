import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PerspectiveCamera, Scene, Texture } from 'three'
import { universe } from 'koota'
import { Sprite2D } from '../sprites/Sprite2D'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { peekRegistry, type Registry } from './registry'
import type { RegistryData } from '../ecs/batchUtils'

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 16, height: 16 }
  return texture
}

function makeRenderer(): object {
  return { isFakeRenderer: true }
}

function fireSceneHook(scene: Scene, renderer: object): void {
  ;(scene.onBeforeRender as unknown as (...args: unknown[]) => void).call(
    scene,
    renderer,
    scene,
    new PerspectiveCamera(),
    null
  )
}

function registryData(registry: Registry): RegistryData {
  return registry._registryData()!
}

describe('auto-batch: threshold, tiers, hysteresis, demotion', () => {
  let scene: Scene
  let renderer: object
  let texture: Texture

  beforeEach(() => {
    scene = new Scene()
    renderer = makeRenderer()
    texture = makeTexture()
  })

  afterEach(() => {
    universe.reset()
  })

  it('two sprites sharing a run auto-share a tier-0 batch on the first render call', () => {
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    scene.add(a)
    scene.add(b)

    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)!
    const data = registryData(registry)

    expect(data.activeBatches.length).toBe(1)
    const mesh = data.batchSlots.find((m) => m !== null)!
    expect(mesh.maxSize).toBe(64) // tier 0
    expect(mesh.activeCount).toBe(2)

    // First-frame correctness: both sprites' own meshes already hidden
    expect(a.visible).toBe(false)
    expect(b.visible).toBe(false)
    expect(a._batchMesh).toBe(mesh)
    expect(b._batchMesh).toBe(mesh)
  })

  it('a single sprite stays standalone; a sibling promotes both', () => {
    const a = new Sprite2D({ texture })
    scene.add(a)
    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)!
    expect(a.entity).toBeNull()
    expect(a.visible).toBe(true) // draws as its own Mesh
    expect(registry.standalone.has(a)).toBe(true)
    expect(registryData(registry).activeBatches.length).toBe(0)

    const b = new Sprite2D({ texture })
    scene.add(b)
    fireSceneHook(scene, renderer)

    expect(a.entity).not.toBeNull()
    expect(b.entity).not.toBeNull()
    expect(a.visible).toBe(false)
    expect(b.visible).toBe(false)
    expect(registryData(registry).activeBatches.length).toBe(1)
  })

  it('a third sprite joins the existing run immediately (no threshold re-wait)', () => {
    scene.add(new Sprite2D({ texture }))
    scene.add(new Sprite2D({ texture }))
    fireSceneHook(scene, renderer)

    const c = new Sprite2D({ texture })
    scene.add(c)
    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)!
    expect(c.entity).not.toBeNull()
    const data = registryData(registry)
    expect(data.activeBatches.length).toBe(1)
    const mesh = data.batchSlots.find((m) => m !== null)!
    expect(mesh.activeCount).toBe(3)
  })

  it('tier ladder: 65 sprites produce a 64-slot batch plus a 256-slot batch', () => {
    const sprites: Sprite2D[] = []
    for (let i = 0; i < 65; i++) {
      const sprite = new Sprite2D({ texture })
      sprites.push(sprite)
      scene.add(sprite)
    }
    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)!
    const data = registryData(registry)
    const sizes = data.batchSlots
      .filter((m) => m !== null)
      .map((m) => m!.maxSize)
      .sort((x, y) => x - y)
    expect(sizes).toEqual([64, 256])

    const counts = data.batchSlots
      .filter((m) => m !== null)
      .map((m) => m!.activeCount)
      .sort((x, y) => x - y)
    expect(counts).toEqual([1, 64])
  })

  it('hysteresis: batch survives at N=1, dies at N=0', () => {
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    scene.add(a)
    scene.add(b)
    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)!
    const data = registryData(registry)
    expect(data.activeBatches.length).toBe(1)

    scene.remove(a)
    fireSceneHook(scene, renderer)
    registry.group.update()
    expect(data.activeBatches.length).toBe(1) // N=1 keeps the batch — no flap

    scene.remove(b)
    fireSceneHook(scene, renderer)
    registry.group.update()
    expect(data.activeBatches.length).toBe(0) // N=0 destroys
    expect(b.visible).toBe(true)
  })

  it('renderOrder override demotes the auto sprite in place (stays a scene child)', () => {
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    scene.add(a)
    scene.add(b)
    fireSceneHook(scene, renderer)
    expect(a.visible).toBe(false)

    a.renderOrder = 999

    expect(a.entity).toBeNull()
    expect(a.visible).toBe(true)
    expect(a.parent).toBe(scene) // never reparented — it was already in the tree
    expect(a.renderOrder).toBe(999)

    // Not re-promoted on later sweeps
    fireSceneHook(scene, renderer)
    expect(a.entity).toBeNull()

    // The sibling is unaffected
    expect(b.entity).not.toBeNull()
    expect(b.visible).toBe(false)
  })

  it('different camera masks route to different batches on the auto path', () => {
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    const c = new Sprite2D({ texture })
    const d = new Sprite2D({ texture })
    b.layers.set(2)
    d.layers.set(2)
    scene.add(a)
    scene.add(b)
    scene.add(c)
    scene.add(d)
    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)!
    const data = registryData(registry)
    expect(data.activeBatches.length).toBe(2)
    const masks = data.batchSlots
      .filter((m) => m !== null)
      .map((m) => m!.layers.mask)
      .sort((x, y) => x - y)
    expect(masks).toEqual([1, 4])
  })

  it('a standalone sprite changing its mask into a shared run re-evaluates and batches', () => {
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    b.layers.set(2) // different run — both stay standalone
    scene.add(a)
    scene.add(b)
    fireSceneHook(scene, renderer)
    expect(a.entity).toBeNull()
    expect(b.entity).toBeNull()

    b.layers.set(0) // back to default mask — now shares a's run
    fireSceneHook(scene, renderer)

    expect(a.entity).not.toBeNull()
    expect(b.entity).not.toBeNull()
    expect(a._batchMesh).toBe(b._batchMesh)
  })

  it('setFrame on a batched auto sprite does not reveal its own mesh', () => {
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    scene.add(a)
    scene.add(b)
    fireSceneHook(scene, renderer)
    expect(a.visible).toBe(false)

    a.setFrame({
      name: 'f',
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
      sourceWidth: 8,
      sourceHeight: 8,
    })
    expect(a.visible).toBe(false)
  })

  it('explicit SpriteGroup maxBatchSize still pins the batch size', () => {
    const group = new SpriteGroup({ maxBatchSize: 8192 })
    const sprite = new Sprite2D({ texture })
    group.add(sprite)
    group.update()

    const data = (
      group as unknown as { _getRegistry(): RegistryData | null }
    )._getRegistry()!
    const mesh = data.batchSlots.find((m) => m !== null)!
    expect(mesh.maxSize).toBe(8192)

    group.dispose()
  })
})

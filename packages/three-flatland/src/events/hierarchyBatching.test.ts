import { afterEach, describe, expect, it, vi } from 'vitest'
import { Group, Raycaster, Scene, Texture, Vector3 } from 'three'
import { universe } from 'koota'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { Sprite2D } from '../sprites/Sprite2D'
import { flatlandRegister, flatlandSceneSweep, flatlandUnregister } from '../orchestration/orchestrator'

function makeSprite(scale = 20, texture = new Texture()): Sprite2D {
  const sprite = new Sprite2D({ texture, anchor: [0.5, 0.5] })
  sprite.scale.set(scale, scale, 1)
  sprite.hitTestMode = 'bounds'
  return sprite
}

function instanceSlot(sprite: Sprite2D): Float32Array {
  expect(sprite._batchMesh).not.toBeNull()
  const offset = sprite._batchSlot * 16
  return (sprite._batchMesh!.instanceMatrix.array as Float32Array).slice(offset, offset + 16)
}

function raycastAt(sprite: Sprite2D, x: number, y: number): number {
  const raycaster = new Raycaster(new Vector3(x, y, 100), new Vector3(0, 0, -1))
  return raycaster.intersectObject(sprite).length
}

afterEach(() => {
  universe.reset()
})

describe('auto batching preserves the source hierarchy', () => {
  it('composes transforms through ordinary nested Object3D parents', () => {
    const renderer = {}
    const scene = new Scene()
    const outer = new Group()
    const inner = new Group()
    outer.position.set(100, 20, 0)
    inner.position.set(30, 5, 0)
    outer.add(inner)
    scene.add(outer)

    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    first.position.set(4, 6, 0)
    inner.add(first, second)
    flatlandRegister(first, renderer, scene)
    flatlandRegister(second, renderer, scene)
    flatlandSceneSweep(renderer, scene)

    scene.updateMatrixWorld(true)

    const slot = instanceSlot(first)
    expect(slot[12]).toBe(134)
    expect(slot[13]).toBe(31)
    expect(raycastAt(first, 134, 31)).toBe(1)
    expect(raycastAt(first, 4, 6)).toBe(0)

    flatlandUnregister(first)
    flatlandUnregister(second)
  })

  it('recomposes an auto-batched sprite after same-world remove and re-add', () => {
    const renderer = {}
    const scene = new Scene()
    const outer = new Group()
    const inner = new Group()
    outer.position.x = 100
    inner.position.x = 30
    outer.add(inner)
    scene.add(outer)

    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    first.position.x = 4
    inner.add(first, second)
    flatlandRegister(first, renderer, scene)
    flatlandRegister(second, renderer, scene)
    flatlandSceneSweep(renderer, scene)
    scene.updateMatrixWorld(true)
    expect(instanceSlot(first)[12]).toBe(134)

    inner.remove(first)
    inner.add(first)
    flatlandRegister(first, renderer, scene)
    flatlandSceneSweep(renderer, scene)
    scene.updateMatrixWorld(true)

    expect(instanceSlot(first)[12]).toBe(134)
    flatlandUnregister(first)
    flatlandUnregister(second)
  })

  it('keeps React Activity visibility separate from source-mesh suppression', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const activityHost = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    activityHost.add(first, second)
    spriteGroup.add(activityHost)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    expect(first._hierarchyManaged).toBe(true)
    expect(first._batchMesh?.parent).toBe(spriteGroup)
    expect(first._autoBatched).toBe(true)
    expect(first.visible).toBe(false)
    expect(instanceSlot(first)[15]).toBe(1)

    // This is the same host mutation R3F performs for hidden Activity trees.
    first.visible = false
    first.setFrame({ name: 'late-frame', x: 0, y: 0, width: 1, height: 1, sourceWidth: 1, sourceHeight: 1 })
    scene.updateMatrixWorld(true)
    expect(first._isAuthoredVisible()).toBe(false)
    expect(instanceSlot(first)[0]).toBe(0)
    expect(instanceSlot(first)[5]).toBe(0)
    expect(raycastAt(first, 0, 0)).toBe(0)

    first.visible = true
    scene.updateMatrixWorld(true)
    expect(first.visible).toBe(false) // still batch-suppressed, never double-drawn
    expect(instanceSlot(first)[15]).toBe(1)
    expect(raycastAt(first, 0, 0)).toBe(1)

    activityHost.remove(first)
    expect(first.visible).toBe(true)
    spriteGroup.dispose()
  })

  it('refreshes nested parent transforms before the same render pass', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const parent = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    parent.add(first, second)
    spriteGroup.add(parent)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    parent.position.set(75, 25, 0)
    scene.updateMatrixWorld(true)

    expect(instanceSlot(first)[12]).toBe(75)
    expect(instanceSlot(first)[13]).toBe(25)
    spriteGroup.dispose()
  })

  it('enrolls late descendants and follows reparenting between ordinary groups', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const left = new Group()
    const right = new Group()
    right.position.x = 90
    spriteGroup.add(left, right)
    scene.add(spriteGroup)

    const sprite = makeSprite()
    sprite.position.x = 10
    left.add(sprite)
    scene.updateMatrixWorld(true)
    expect(sprite._hierarchyManaged).toBe(true)
    expect(sprite.parent).toBe(left)
    expect(sprite.matrixWorld.elements[12]).toBe(10)

    right.add(sprite)
    scene.updateMatrixWorld(true)
    expect(sprite._hierarchyManaged).toBe(true)
    expect(sprite._hierarchyOwner).toBe(spriteGroup)
    expect(sprite.parent).toBe(right)
    expect(sprite.matrixWorld.elements[12]).toBe(100)
    expect(raycastAt(sprite, 100, 0)).toBe(1)
    expect(raycastAt(sprite, 10, 0)).toBe(0)
    spriteGroup.dispose()
  })

  it('reconciles a whole subtree attached and detached below an existing parent', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const mountedHost = new Group()
    const detachedRoot = new Group()
    const nested = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    nested.position.x = 30
    first.position.x = 5
    nested.add(first, second)
    detachedRoot.add(nested)
    spriteGroup.add(mountedHost)
    scene.add(spriteGroup)

    // Three.js emits `added` only for detachedRoot here, not its sprites.
    mountedHost.add(detachedRoot)
    scene.updateMatrixWorld(true)
    expect(first._hierarchyManaged).toBe(true)
    expect(first._hierarchyOwner).toBe(spriteGroup)
    expect(spriteGroup.spriteCount).toBe(2)
    expect(instanceSlot(first)[12]).toBe(35)

    // The inverse mutation likewise emits no descendant `removed` event.
    mountedHost.remove(detachedRoot)
    scene.updateMatrixWorld(true)
    expect(first._hierarchyManaged).toBe(false)
    expect(first._hierarchyOwner).toBeNull()
    expect(first.entity).toBeNull()
    expect(first.visible).toBe(true)
    expect(spriteGroup.spriteCount).toBe(0)

    mountedHost.add(detachedRoot)
    scene.updateMatrixWorld(true)
    expect(first._hierarchyManaged).toBe(true)
    expect(first._hierarchyOwner).toBe(spriteGroup)
    expect(spriteGroup.spriteCount).toBe(2)
    expect(instanceSlot(first)[12]).toBe(35)
    spriteGroup.dispose()
  })

  it('keeps hierarchy ownership inside the nearest nested SpriteGroup', () => {
    const scene = new Scene()
    const outer = new SpriteGroup()
    const outerHost = new Group()
    const inner = new SpriteGroup()
    const innerHost = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    innerHost.add(first, second)
    inner.add(innerHost)
    outerHost.add(inner)
    outer.add(outerHost)
    scene.add(outer)
    scene.updateMatrixWorld(true)

    expect(first._hierarchyManaged).toBe(true)
    expect(first._hierarchyOwner).toBe(inner)
    expect(first._flatlandWorld).toBe(inner.world)
    expect(inner.spriteCount).toBe(2)
    expect(outer.spriteCount).toBe(0)

    inner.dispose()
    outer.dispose()
  })

  it('transfers a populated ordinary subtree between SpriteGroup worlds', () => {
    const scene = new Scene()
    const left = new SpriteGroup()
    const right = new SpriteGroup()
    const leftHost = new Group()
    const rightHost = new Group()
    const movingSubtree = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    movingSubtree.add(first, second)
    leftHost.add(movingSubtree)
    left.add(leftHost)
    right.add(rightHost)
    scene.add(left, right)
    scene.updateMatrixWorld(true)

    expect(first._hierarchyOwner).toBe(left)
    expect(first._flatlandWorld).toBe(left.world)

    // Only movingSubtree receives Three.js's removed/added events.
    rightHost.add(movingSubtree)
    scene.updateMatrixWorld(true)
    expect(first._hierarchyOwner).toBe(right)
    expect(first._flatlandWorld).toBe(right.world)
    expect(first.entity).not.toBeNull()
    expect(left.spriteCount).toBe(0)
    expect(right.spriteCount).toBe(2)

    left.dispose()
    right.dispose()
  })

  it('transfers a direct enrollment into another SpriteGroup hierarchy', () => {
    const scene = new Scene()
    const left = new SpriteGroup()
    const right = new SpriteGroup()
    const rightHost = new Group()
    rightHost.position.x = 500
    right.add(rightHost)

    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    first.position.x = 4
    left.add(first)
    left.add(second)
    scene.add(left, right)
    scene.updateMatrixWorld(true)
    expect(left.spriteCount).toBe(2)

    rightHost.add(first)
    scene.updateMatrixWorld(true)

    expect(first._hierarchyOwner).toBe(right)
    expect(first._flatlandWorld).toBe(right.world)
    expect(left.spriteCount).toBe(1)
    expect(right.spriteCount).toBe(1)
    expect(instanceSlot(first)[12]).toBe(504)
    left.dispose()
    right.dispose()
  })

  it('lets an explicit SpriteGroup adopt an auto-batched subtree', () => {
    const renderer = {}
    const scene = new Scene()
    const sourceRoot = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    sourceRoot.add(first, second)
    scene.add(sourceRoot)
    flatlandRegister(first, renderer, scene)
    flatlandRegister(second, renderer, scene)
    flatlandSceneSweep(renderer, scene)
    scene.updateMatrixWorld(true)
    expect(first._autoRegistry).not.toBeNull()

    const explicit = new SpriteGroup()
    const explicitHost = new Group()
    explicit.add(explicitHost)
    scene.add(explicit)
    explicitHost.add(sourceRoot)
    scene.updateMatrixWorld(true)

    expect(first._autoRegistry).toBeNull()
    expect(first._hierarchyOwner).toBe(explicit)
    expect(first._flatlandWorld).toBe(explicit.world)
    expect(explicit.spriteCount).toBe(2)
    explicit.dispose()
  })

  it('matches Object3D.remove semantics for a retained deep sprite', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const host = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    host.add(first, second)
    spriteGroup.add(host)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    spriteGroup.remove(first)
    scene.updateMatrixWorld(true)
    expect(first._hierarchyManaged).toBe(true)
    expect(first._hierarchyOwner).toBe(spriteGroup)
    expect(first.entity).not.toBeNull()
    expect(spriteGroup.spriteCount).toBe(2)

    host.remove(first)
    scene.updateMatrixWorld(true)
    expect(first._hierarchyManaged).toBe(false)
    expect(first._hierarchyOwner).toBeNull()
    expect(first.entity).toBeNull()
    expect(first.visible).toBe(true)
    expect(spriteGroup.spriteCount).toBe(1)
    spriteGroup.dispose()
  })

  it('clears stale 3D matrix terms when a sprite returns to the identity fast path', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const host = new Group()
    host.rotation.x = 0.5
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    host.add(first, second)
    spriteGroup.add(host)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)
    expect(first.matrixWorld.elements[9]).not.toBe(0)

    host.remove(first)
    spriteGroup.add(first)
    scene.updateMatrixWorld(true)
    scene.updateMatrixWorld(true)

    expect(first.matrixWorld.elements[8]).toBe(0)
    expect(first.matrixWorld.elements[9]).toBe(0)
    expect(first.matrixWorld.elements[10]).toBe(1)
    spriteGroup.dispose()
  })

  it('uploads only slots beneath the ancestor that changed', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const left = new Group()
    const right = new Group()
    const texture = new Texture()
    const sprites = [makeSprite(20, texture), makeSprite(20, texture), makeSprite(20, texture), makeSprite(20, texture)]
    left.add(sprites[0]!, sprites[1]!)
    right.add(sprites[2]!, sprites[3]!)
    spriteGroup.add(left, right)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    const batch = sprites[0]!._batchMesh!
    const markMatrixDirty = vi.spyOn(batch, 'markMatrixDirty')
    left.position.x = 50
    scene.updateMatrixWorld(true)

    const changedSlots = markMatrixDirty.mock.calls.map(([slot]) => slot).sort((a, b) => a - b)
    expect(changedSlots).toEqual([sprites[0]!._batchSlot, sprites[1]!._batchSlot].sort((a, b) => a - b))
    expect(instanceSlot(sprites[0]!)[12]).toBe(50)
    expect(instanceSlot(sprites[2]!)[12]).toBe(0)
    spriteGroup.dispose()
  })

  it('moves the shared draw root without uploading unchanged relative slots', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    spriteGroup.add(first, second)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    const batch = first._batchMesh!
    const markMatrixDirty = vi.spyOn(batch, 'markMatrixDirty')
    spriteGroup.position.set(80, 30, 0)
    scene.updateMatrixWorld(true)

    expect(markMatrixDirty).not.toHaveBeenCalled()
    expect(batch.matrixWorld.elements[12]).toBe(80)
    expect(first.matrixWorld.elements[12]).toBe(80)
    expect(raycastAt(first, 80, 30)).toBe(1)
    spriteGroup.dispose()
  })

  it('honors explicit invalidation when automatic transform sync is disabled', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup({ autoInvalidateTransforms: false })
    const parent = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    parent.add(first, second)
    spriteGroup.add(parent)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    parent.position.x = 20
    scene.updateMatrixWorld(true)
    expect(instanceSlot(first)[12]).toBe(0)

    parent.visible = false
    spriteGroup.invalidateTransforms()
    scene.updateMatrixWorld(true)
    expect(instanceSlot(first)[0]).toBe(0)

    parent.visible = true
    parent.position.x = 40
    spriteGroup.invalidateTransforms()
    scene.updateMatrixWorld(true)
    expect(instanceSlot(first)[0]).toBe(20)
    expect(instanceSlot(first)[12]).toBe(40)
    spriteGroup.dispose()
  })

  it('suppresses rendering and picking when an ordinary ancestor is hidden', () => {
    const renderer = {}
    const scene = new Scene()
    const parent = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    parent.add(first, second)
    scene.add(parent)
    flatlandRegister(first, renderer, scene)
    flatlandRegister(second, renderer, scene)
    flatlandSceneSweep(renderer, scene)
    scene.updateMatrixWorld(true)

    parent.visible = false
    scene.updateMatrixWorld(true)
    expect(instanceSlot(first)[0]).toBe(0)
    expect(instanceSlot(first)[5]).toBe(0)
    expect(raycastAt(first, 0, 0)).toBe(0)

    parent.visible = true
    scene.updateMatrixWorld(true)
    expect(instanceSlot(first)[0]).toBe(20)
    expect(instanceSlot(first)[5]).toBe(20)
    expect(instanceSlot(first)[15]).toBe(1)

    flatlandUnregister(first)
    flatlandUnregister(second)
  })
})

describe('SpriteGroup clipRect', () => {
  it('uses nested WebGPU clipping groups and filters pointer hits', () => {
    const scene = new Scene()
    const outer = new SpriteGroup({ clipRect: [0, -100, 40, 200] })
    const inner = new SpriteGroup({ clipRect: [0, 0, 50, 50] })
    const transformed = new Group()
    transformed.position.set(5, 5, 0)
    outer.add(inner)
    inner.add(transformed)
    scene.add(outer)

    const sprite = makeSprite(200)
    sprite.position.set(20, 20, 0)
    transformed.add(sprite)
    scene.updateMatrixWorld(true)

    expect(outer.isClippingGroup).toBe(true)
    expect(inner.clippingPlanes).toHaveLength(4)
    expect(sprite._hierarchyManaged).toBe(true)
    expect(sprite._batchMesh?.parent).toBe(inner)
    expect(raycastAt(sprite, 25, 25)).toBe(1)
    expect(raycastAt(sprite, 75, 25)).toBe(0)
    expect(raycastAt(sprite, -25, 25)).toBe(0)
    expect(raycastAt(sprite, 45, 25)).toBe(0) // inside inner, outside outer
  })

  it('keeps clipRect local when the SpriteGroup is transformed', () => {
    const scene = new Scene()
    const group = new SpriteGroup({ clipRect: [0, 0, 50, 50] })
    group.position.x = 100
    scene.add(group)

    const sprite = makeSprite(200)
    sprite.position.set(25, 25, 0)
    group.add(sprite)
    scene.updateMatrixWorld(true)

    expect(raycastAt(sprite, 125, 25)).toBe(1)
    expect(raycastAt(sprite, 175, 25)).toBe(0)
    expect(group.clippingPlanes[0]!.distanceToPoint(new Vector3(100, 0, 0))).toBeCloseTo(0)
  })
})

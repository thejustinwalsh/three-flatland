import { describe, expect, it, vi } from 'vitest'
import { Group, Raycaster, Scene, Texture, Vector3 } from 'three'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { Sprite2D } from '../sprites/Sprite2D'
import { flatlandRegister, flatlandSceneSweep, flatlandUnregister } from '../orchestration/orchestrator'
import { getSpriteBatchOwnership } from '../internal/sprite-batch-ownership'

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

function batchRaycastAt(sprite: Sprite2D, x: number, y: number): number {
  const raycaster = new Raycaster(new Vector3(x, y, 100), new Vector3(0, 0, -1))
  return raycaster.intersectObject(sprite._batchMesh!).filter((hit) => hit.object === sprite).length
}

describe('auto batching preserves the source hierarchy', () => {
  it('projects public visibility writes into a directly owned batch slot', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const sprite = makeSprite()
    spriteGroup.add(sprite)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    expect(sprite.visible).toBe(true)
    expect(instanceSlot(sprite)[0]).toBe(20)
    sprite.visible = false
    scene.updateMatrixWorld(true)
    expect(sprite.visible).toBe(false)
    expect(instanceSlot(sprite)[0]).toBe(0)
    expect(raycastAt(sprite, 0, 0)).toBe(0)

    sprite.visible = true
    scene.updateMatrixWorld(true)
    expect(sprite.visible).toBe(true)
    expect(instanceSlot(sprite)[0]).toBe(20)
    expect(raycastAt(sprite, 0, 0)).toBe(1)

    spriteGroup.dispose()
  })

  it.each(['remove', 'dispose'] as const)(
    'hides a hierarchy-owned row when updateMatrix reentrantly %ss its sprite',
    (action) => {
      const scene = new Scene()
      const spriteGroup = new SpriteGroup()
      const parent = new Group()
      const texture = new Texture()
      const sprite = makeSprite(20, texture)
      const peer = makeSprite(20, texture)
      parent.add(sprite, peer)
      spriteGroup.add(parent)
      scene.add(spriteGroup)
      scene.updateMatrixWorld(true)

      const batch = sprite._batchMesh!
      const ownership = getSpriteBatchOwnership(batch)
      const slot = sprite._batchSlot
      const owner = sprite.entity!
      const updateMatrix = sprite.updateMatrix.bind(sprite)
      let releaseDuringUpdate = true
      sprite.updateMatrix = () => {
        updateMatrix()
        if (!releaseDuringUpdate) return
        releaseDuringUpdate = false
        if (action === 'remove') parent.remove(sprite)
        else sprite.dispose()
      }

      sprite.position.x = 12
      scene.updateMatrixWorld(true)

      expect(sprite.entity).toBeNull()
      expect(ownership.slotEntities[slot]).toBe(owner)
      expect(Array.from((batch.instanceMatrix.array as Float32Array).slice(slot * 16, slot * 16 + 16))).toEqual(
        Array(16).fill(0)
      )
      expect((batch.getColorAttribute().array as Float32Array)[slot * 16 + 4 + 3]).toBe(0)
      expect(batch.grid.size).toBe(1)

      scene.updateMatrixWorld(true)
      expect(ownership.slotEntities[slot]).toBe(0)
      spriteGroup.dispose()
    }
  )

  it('keeps transform scratch isolated across nested updates in two worlds', () => {
    const sceneA = new Scene()
    const sceneB = new Scene()
    const groupA = new SpriteGroup()
    const groupB = new SpriteGroup()
    const parentA = new Group()
    const parentB = new Group()
    const texture = new Texture()
    const spriteA = makeSprite(20, texture)
    const peerA = makeSprite(20, texture)
    const spriteB = makeSprite(20, texture)
    const peerB = makeSprite(20, texture)

    groupA.position.x = 100
    parentA.position.x = 10
    spriteA.position.x = 1
    parentA.add(spriteA, peerA)
    groupA.add(parentA)
    sceneA.add(groupA)

    groupB.position.x = 1_000
    parentB.position.x = 20
    spriteB.position.x = 2
    parentB.add(spriteB, peerB)
    groupB.add(parentB)
    sceneB.add(groupB)

    sceneA.updateMatrixWorld(true)
    sceneB.updateMatrixWorld(true)

    const updateMatrixA = spriteA.updateMatrix.bind(spriteA)
    let nestedUpdate = true
    spriteA.updateMatrix = () => {
      updateMatrixA()
      if (!nestedUpdate) return
      nestedUpdate = false
      spriteB.position.x = 4
      sceneB.updateMatrixWorld(true)
    }
    spriteA.position.x = 3
    sceneA.updateMatrixWorld(true)

    expect(instanceSlot(spriteA)[12]).toBe(13)
    expect(spriteA.matrixWorld.elements[12]).toBe(113)
    expect(instanceSlot(spriteB)[12]).toBe(24)
    expect(spriteB.matrixWorld.elements[12]).toBe(1_024)

    // Release both independent registries so their WeakMap-keyed scratch can
    // be collected with the worlds instead of retaining cross-world parents.
    groupA.dispose()
    groupB.dispose()
    expect(spriteA.entity).toBeNull()
    expect(spriteB.entity).toBeNull()
  })

  it('projects public visibility writes into an auto-owned batch slot', () => {
    const renderer = {}
    const scene = new Scene()
    const parent = new Group()
    const texture = new Texture()
    const sprite = makeSprite(20, texture)
    const batchPeer = makeSprite(20, texture)
    parent.add(sprite, batchPeer)
    scene.add(parent)
    flatlandRegister(sprite, renderer, scene)
    flatlandRegister(batchPeer, renderer, scene)
    flatlandSceneSweep(renderer, scene)
    scene.updateMatrixWorld(true)

    expect(sprite._autoRegistry).not.toBeNull()
    expect(sprite.visible).toBe(true)
    expect(sprite.isMesh).toBe(false)
    expect(instanceSlot(sprite)[0]).toBe(20)
    sprite.visible = false
    scene.updateMatrixWorld(true)
    expect(sprite.visible).toBe(false)
    expect(instanceSlot(sprite)[0]).toBe(0)
    expect(raycastAt(sprite, 0, 0)).toBe(0)

    sprite.visible = true
    scene.updateMatrixWorld(true)
    expect(sprite.visible).toBe(true)
    expect(sprite.isMesh).toBe(false)
    expect(instanceSlot(sprite)[0]).toBe(20)
    expect(raycastAt(sprite, 0, 0)).toBe(1)

    flatlandUnregister(sprite)
    flatlandUnregister(batchPeer)
  })

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

  it('preserves hierarchy visibility, transforms, and broadphase state across texture reassignment', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const parent = new Group()
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    parent.position.x = 100
    first.position.x = 5
    first.visible = false
    parent.add(first, second)
    spriteGroup.add(parent)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    expect(instanceSlot(first)[0]).toBe(0)
    expect(instanceSlot(first)[12]).toBe(105)
    expect(batchRaycastAt(first, 105, 0)).toBe(0)

    const previousBatch = first._batchMesh
    first.texture = new Texture()
    scene.updateMatrixWorld(true)

    expect(first._batchMesh).not.toBe(previousBatch)
    expect(first.visible).toBe(false)
    expect(instanceSlot(first)[0]).toBe(0)
    expect(instanceSlot(first)[12]).toBe(105)
    expect(batchRaycastAt(first, 105, 0)).toBe(0)

    first.visible = true
    scene.updateMatrixWorld(true)
    expect(instanceSlot(first)[0]).toBe(20)
    expect(instanceSlot(first)[12]).toBe(105)
    expect(batchRaycastAt(first, 105, 0)).toBe(1)
    spriteGroup.dispose()
  })

  it('preserves the old R3F picking proxy when reassignment preparation fails', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const sprite = makeSprite()
    const interaction: object[] = [sprite]
    const root = {
      getState: () => ({ internal: { interaction, initialHits: [] } }),
    }
    ;(sprite as unknown as { __r3f: unknown }).__r3f = {
      root,
      eventCount: 1,
      handlers: { onClick() {} },
    }

    spriteGroup.add(sprite)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    const oldBatch = sprite._batchMesh
    const oldSlot = sprite._batchSlot
    expect(oldBatch).not.toBeNull()
    expect(sprite._pickProxied).toBe(true)
    expect(Object.hasOwn(sprite, 'raycast')).toBe(true)
    expect(sprite.raycast).toBeNull()
    expect(interaction).toEqual([oldBatch])

    const updateMatrix = vi.spyOn(sprite, 'updateMatrix').mockImplementation(() => {
      throw new Error('reassignment preparation failed')
    })
    sprite.texture = new Texture()

    expect(() => scene.updateMatrixWorld(true)).toThrow('reassignment preparation failed')
    expect(sprite._batchMesh).toBe(oldBatch)
    expect(sprite._batchSlot).toBe(oldSlot)
    expect(getSpriteBatchOwnership(oldBatch!).slotEntities[oldSlot]).not.toBe(0)
    expect(getSpriteBatchOwnership(oldBatch!).spriteAtSlot(oldSlot)).toBe(sprite)
    expect(sprite._pickProxied).toBe(true)
    expect(Object.hasOwn(sprite, 'raycast')).toBe(true)
    expect(sprite.raycast).toBeNull()
    expect(interaction).toEqual([oldBatch])

    updateMatrix.mockRestore()
    scene.updateMatrixWorld(true)
    expect(sprite._batchMesh).not.toBe(oldBatch)
    expect(sprite._pickProxied).toBe(true)
    expect(interaction).toEqual([sprite._batchMesh])
    spriteGroup.dispose()
  })

  it('keeps ownership coherent when the R3F store fails during picking handoff', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const sprite = makeSprite()
    const interaction: object[] = [sprite]
    let storeAvailable = true
    const root = {
      getState: () => {
        if (!storeAvailable) throw new Error('store unavailable')
        return { internal: { interaction, initialHits: [] } }
      },
    }
    ;(sprite as unknown as { __r3f: unknown }).__r3f = {
      root,
      eventCount: 1,
      handlers: { onClick() {} },
    }

    spriteGroup.add(sprite)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)
    const oldBatch = sprite._batchMesh!
    const oldSlot = sprite._batchSlot

    storeAvailable = false
    sprite.texture = new Texture()
    expect(() => scene.updateMatrixWorld(true)).not.toThrow()

    const newBatch = sprite._batchMesh!
    const newSlot = sprite._batchSlot
    expect(newBatch).not.toBe(oldBatch)
    expect(getSpriteBatchOwnership(oldBatch).slotEntities[oldSlot]).toBe(0)
    expect(getSpriteBatchOwnership(newBatch).slotEntities[newSlot]).not.toBe(0)
    expect(getSpriteBatchOwnership(newBatch).spriteAtSlot(newSlot)).toBe(sprite)
    expect(interaction).not.toContain(oldBatch)
    expect(interaction).toContain(sprite)
    expect(sprite._pickProxied).toBe(false)

    spriteGroup.dispose()
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
    expect(first.visible).toBe(true)
    expect(first.isMesh).toBe(false)
    expect(instanceSlot(first)[0]).toBe(20)

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
    expect(first.visible).toBe(true)
    expect(first.isMesh).toBe(false) // still omitted from render-list projection, never double-drawn
    expect(instanceSlot(first)[0]).toBe(20)
    expect(raycastAt(first, 0, 0)).toBe(1)

    activityHost.remove(first)
    expect(first.visible).toBe(true)
    expect(first.isMesh).toBe(true)
    spriteGroup.dispose()
  })

  it('refreshes nested parent transforms independently of pixel snapping', () => {
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

    first.pixelPerfect = false
    parent.position.set(10, 20, 0)
    scene.updateMatrixWorld(true)
    expect(instanceSlot(first)[12]).toBe(10)
    expect(instanceSlot(first)[13]).toBe(20)

    first.pixelPerfect = true
    const extras = first._batchMesh!.geometry.getAttribute('instanceExtras')
    expect([extras.getY(first._batchSlot), extras.getZ(first._batchSlot), extras.getW(first._batchSlot)]).toEqual([
      0, 0, 0,
    ])
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
    expect(first.isMesh).toBe(true)
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
    const oldBatch = first._batchMesh!

    // Only movingSubtree receives Three.js's removed/added events.
    rightHost.add(movingSubtree)
    scene.updateMatrixWorld(true)
    expect(first._hierarchyOwner).toBe(right)
    expect(first._flatlandWorld).toBe(right.world)
    expect(first.entity).not.toBeNull()
    expect(left.spriteCount).toBe(0)
    expect(left.batchCount).toBe(0)
    expect(oldBatch.activeCount).toBe(0)
    expect(right.spriteCount).toBe(2)
    expect(first._batchMesh).not.toBe(oldBatch)
    expect(first.isMesh).toBe(false)

    leftHost.add(movingSubtree)
    scene.updateMatrixWorld(true)
    scene.updateMatrixWorld(true)
    expect(first._hierarchyOwner).toBe(left)
    expect(first._flatlandWorld).toBe(left.world)
    expect(first.entity).not.toBeNull()
    expect(left.spriteCount).toBe(2)
    expect(right.spriteCount).toBe(0)
    expect(first.isMesh).toBe(false)

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
    const oldBatch = first._batchMesh!

    rightHost.add(first)
    scene.updateMatrixWorld(true)

    expect(first._hierarchyOwner).toBe(right)
    expect(first._flatlandWorld).toBe(right.world)
    expect(left.spriteCount).toBe(1)
    expect(oldBatch.activeCount).toBe(1)
    expect(right.spriteCount).toBe(1)
    expect(instanceSlot(first)[12]).toBe(504)
    expect(first.isMesh).toBe(false)
    left.dispose()
    right.dispose()
  })

  it('preserves hierarchy ownership after attempted direct adoption by another group', () => {
    const scene = new Scene()
    const left = new SpriteGroup()
    const right = new SpriteGroup()
    const leftHost = new Group()
    const texture = new Texture()
    const sprite = makeSprite(20, texture)
    leftHost.add(sprite)
    left.add(leftHost)
    scene.add(left, right)
    scene.updateMatrixWorld(true)

    expect(sprite._hierarchyOwner).toBe(left)
    expect(left.spriteCount).toBe(1)
    expect(right.spriteCount).toBe(0)

    // Direct enrollment releases the previous world cleanly, but the source
    // remains below leftHost, so the authored hierarchy reclaims it on sync.
    right.add(sprite)
    expect(sprite._hierarchyOwner).toBeNull()
    expect(left.spriteCount).toBe(0)
    expect(right.spriteCount).toBe(1)

    scene.updateMatrixWorld(true)
    expect(sprite._hierarchyOwner).toBe(left)
    expect(sprite._flatlandWorld).toBe(left.world)
    expect(left.spriteCount).toBe(1)
    expect(right.spriteCount).toBe(0)

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

  it('clears auto orchestration when a sprite is added directly to a SpriteGroup', () => {
    const renderer = {}
    const scene = new Scene()
    const sourceRoot = new Group()
    sourceRoot.position.x = 1_000
    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    first.position.x = 20
    sourceRoot.add(first, second)
    scene.add(sourceRoot)
    flatlandRegister(first, renderer, scene)
    flatlandRegister(second, renderer, scene)
    flatlandSceneSweep(renderer, scene)
    scene.updateMatrixWorld(true)
    expect(first._autoRegistry).not.toBeNull()

    const explicit = new SpriteGroup()
    explicit.position.x = 100
    scene.add(explicit)
    explicit.add(first)
    scene.updateMatrixWorld(true)

    expect(first._autoRegistry).toBeNull()
    expect(first._hierarchyManaged).toBe(false)
    expect(first._flatlandWorld).toBe(explicit.world)
    expect(instanceSlot(first)[12]).toBe(20)
    expect(raycastAt(first, 120, 0)).toBe(1)
    expect(raycastAt(first, 1_020, 0)).toBe(0)

    flatlandUnregister(second)
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
    expect(first.isMesh).toBe(true)
    expect(spriteGroup.spriteCount).toBe(1)
    spriteGroup.dispose()
  })

  it('matches Object3D.remove semantics for removeSprites on a retained deep sprite', () => {
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

    const entity = first.entity
    const slot = first._batchSlot
    spriteGroup.removeSprites(first)

    expect(first.entity).toBe(entity)
    expect(first._batchSlot).toBe(slot)
    expect(first._hierarchyManaged).toBe(true)
    expect(first._hierarchyOwner).toBe(spriteGroup)
    expect(first.isMesh).toBe(false)
    expect(spriteGroup.spriteCount).toBe(2)

    scene.updateMatrixWorld(true)
    expect(first.entity).toBe(entity)
    expect(first._batchSlot).toBe(slot)
    expect(spriteGroup.spriteCount).toBe(2)
    spriteGroup.dispose()
  })

  it('does not resurrect a disposed hierarchy sprite', () => {
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

    const batch = first._batchMesh!
    first.dispose()

    expect(first.entity).toBeNull()
    expect(first._hierarchyManaged).toBe(false)
    expect(first._hierarchyOwner).toBeNull()
    expect(first.isMesh).toBe(false)
    expect(spriteGroup.spriteCount).toBe(1)
    const disposedHits = new Raycaster(new Vector3(0, 0, 100), new Vector3(0, 0, -1))
      .intersectObject(batch)
      .filter((hit) => hit.object === first)
    expect(disposedHits).toHaveLength(0)

    scene.updateMatrixWorld(true)
    expect(first.entity).toBeNull()
    expect(first._hierarchyManaged).toBe(false)
    expect(first._hierarchyOwner).toBeNull()
    expect(first.isMesh).toBe(false)
    expect(spriteGroup.spriteCount).toBe(1)
    spriteGroup.dispose()
  })

  it('clear releases retained hierarchy sprites before disposing their batches', () => {
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

    spriteGroup.clear()

    expect(spriteGroup.spriteCount).toBe(0)
    expect(spriteGroup.batchCount).toBe(0)
    expect(spriteGroup.children).toHaveLength(0)
    expect(first.entity).toBeNull()
    expect(first._batchMesh).toBeNull()
    expect(first._hierarchyManaged).toBe(false)
    expect(first._hierarchyOwner).toBeNull()
    expect(first.isMesh).toBe(true)

    scene.updateMatrixWorld(true)
    expect(first.entity).toBeNull()
    expect(spriteGroup.spriteCount).toBe(0)
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

  it('composes and hides nested Sprite2D parent-child transforms in the same frame', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup()
    const host = new Group()
    const texture = new Texture()
    // An unready Sprite2D ancestor still contributes its authored visibility
    // to a ready descendant, even though its own batch slot stays hidden.
    const parentSprite = new Sprite2D()
    parentSprite.scale.set(20, 20, 1)
    const childSprite = makeSprite(10, texture)
    parentSprite.position.x = 30
    childSprite.position.x = 5
    parentSprite.add(childSprite)
    host.add(parentSprite)
    spriteGroup.add(host)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    expect(parentSprite._hierarchyManaged).toBe(true)
    expect(childSprite._hierarchyManaged).toBe(true)
    expect(instanceSlot(childSprite)[12]).toBe(130)
    expect(childSprite.matrixWorld.elements[12]).toBe(130)
    expect(batchRaycastAt(childSprite, 130, 0)).toBe(1)

    parentSprite.visible = false
    scene.updateMatrixWorld(true)
    expect(parentSprite.visible).toBe(false)
    expect(childSprite.visible).toBe(true)
    expect(instanceSlot(childSprite)[0]).toBe(0)
    expect(batchRaycastAt(childSprite, 130, 0)).toBe(0)
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

  it('skips hierarchy reconciliation during a reentrant matrix update', () => {
    const spriteGroup = new SpriteGroup()
    const internal = spriteGroup as unknown as {
      _inSystems: boolean
      _reconcileHierarchySprites(): void
    }
    const reconcile = vi.spyOn(internal, '_reconcileHierarchySprites')

    internal._inSystems = true
    spriteGroup.updateMatrixWorld(true)
    internal._inSystems = false

    expect(reconcile).not.toHaveBeenCalled()
    spriteGroup.dispose()
  })

  it('syncs a late assignment when automatic invalidation is disabled', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup({ autoInvalidateTransforms: false })
    void spriteGroup.world
    type BatchAssign = (...args: unknown[]) => boolean
    const internal = spriteGroup as unknown as { _batchAssignSystem: BatchAssign }
    const assign = internal._batchAssignSystem
    let assignCalls = 0
    internal._batchAssignSystem = (...args) => {
      assignCalls++
      return assignCalls === 1 ? false : assign(...args)
    }

    const texture = new Texture()
    const first = makeSprite(20, texture)
    const second = makeSprite(20, texture)
    first.position.x = 35
    spriteGroup.add(first, second)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)

    expect(assignCalls).toBeGreaterThanOrEqual(2)
    expect(instanceSlot(first)[0]).toBe(20)
    expect(instanceSlot(first)[12]).toBe(35)
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

  it('self-invalidates direct visibility when automatic transform sync is disabled', () => {
    const scene = new Scene()
    const spriteGroup = new SpriteGroup({ autoInvalidateTransforms: false })
    const sprite = makeSprite()
    spriteGroup.add(sprite)
    scene.add(spriteGroup)
    scene.updateMatrixWorld(true)
    expect(instanceSlot(sprite)[0]).toBe(20)

    sprite.visible = false
    scene.updateMatrixWorld(true)
    expect(sprite.visible).toBe(false)
    expect(instanceSlot(sprite)[0]).toBe(0)

    sprite.visible = true
    scene.updateMatrixWorld(true)
    expect(sprite.visible).toBe(true)
    expect(instanceSlot(sprite)[0]).toBe(20)
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

    flatlandUnregister(first)
    flatlandUnregister(second)
  })
})

describe('SpriteGroup clipRect', () => {
  it('skips redundant clip-plane projection until the group transform changes', () => {
    const scene = new Scene()
    const group = new SpriteGroup({ clipRect: [0, 0, 50, 50] })
    scene.add(group)
    scene.updateMatrixWorld(true)
    const copy = vi.spyOn(group.clippingPlanes[0]!, 'copy')

    scene.updateMatrixWorld(true)
    expect(copy).not.toHaveBeenCalled()

    group.position.x = 100
    scene.updateMatrixWorld(true)
    expect(copy).toHaveBeenCalledOnce()
    group.dispose()
  })

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
    inner.dispose()
    outer.dispose()
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

    group.position.x = 200
    scene.updateMatrixWorld(true)
    expect(raycastAt(sprite, 125, 25)).toBe(0)
    expect(raycastAt(sprite, 225, 25)).toBe(1)
    expect(group.clippingPlanes[0]!.distanceToPoint(new Vector3(200, 0, 0))).toBeCloseTo(0)
    group.dispose()
  })
})

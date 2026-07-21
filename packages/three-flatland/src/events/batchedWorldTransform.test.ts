import { describe, it, expect } from 'vitest'
import { Matrix4, Raycaster, Scene, Texture, Vector3 } from 'three'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { Sprite2D } from '../sprites/Sprite2D'

/**
 * Batched sprites must render AND hit-test at the same WORLD point.
 *
 * The ECS transform pass is the single writer of a batched sprite's world
 * transform: it folds the SpriteGroup's own world affine into each sprite's
 * local 2D TRS and writes the result to BOTH the batch instanceMatrix slot
 * (what the GPU draws) and `sprite.matrixWorld` (what raycasts read).
 */

function makeSprite(scale = 100): Sprite2D {
  const sprite = new Sprite2D({ texture: new Texture(), anchor: [0.5, 0.5] })
  sprite.scale.set(scale, scale, 1)
  return sprite
}

/** Read the 16-float instance slot for a batched sprite. */
function instanceSlot(sprite: Sprite2D): Float32Array {
  const mesh = sprite._batchMesh
  expect(mesh).not.toBeNull()
  const o = sprite._batchSlot * 16
  return (mesh!.instanceMatrix.array as Float32Array).slice(o, o + 16)
}

describe('batched sprite world transform under a translated SpriteGroup', () => {
  it('folds the group translation into matrixWorld, the instance slot, and raycasts', () => {
    const scene = new Scene()
    const group = new SpriteGroup()
    group.position.x = 500
    scene.add(group)

    const sprite = makeSprite(100)
    group.add(sprite)

    // renderer.render() entry point — runs the ECS schedule.
    scene.updateMatrixWorld(true)

    // (a) matrixWorld carries the group's translation
    expect(sprite.matrixWorld.elements[12]).toBe(500)
    expect(sprite.matrixWorld.elements[13]).toBe(0)
    expect(sprite.matrixWorld.elements[0]).toBe(100)
    expect(sprite.matrixWorld.elements[5]).toBe(100)

    // (b) the instance slot carries the SAME world transform
    const slot = instanceSlot(sprite)
    expect(slot[12]).toBe(500)
    expect(slot[0]).toBe(100)
    expect(slot[5]).toBe(100)

    // (c) a raycast at the sprite's world centre hits; off-sprite misses
    const rc = new Raycaster()
    rc.set(new Vector3(500, 0, 100), new Vector3(0, 0, -1))
    expect(rc.intersectObject(sprite)).toHaveLength(1)

    // 20 units outside the 100-unit quad's right edge
    rc.set(new Vector3(570, 0, 100), new Vector3(0, 0, -1))
    expect(rc.intersectObject(sprite)).toHaveLength(0)

    // The sprite's OLD local position (origin) no longer hits
    rc.set(new Vector3(0, 0, 100), new Vector3(0, 0, -1))
    expect(rc.intersectObject(sprite)).toHaveLength(0)
  })

  it('folds a rotated group affine (2D compose, not translation-only)', () => {
    const scene = new Scene()
    const group = new SpriteGroup()
    group.rotation.z = Math.PI / 2
    scene.add(group)

    const sprite = makeSprite(50)
    sprite.position.set(200, 0, 0)
    group.add(sprite)

    scene.updateMatrixWorld(true)

    // Group rotates the sprite's position (200, 0) to (0, 200)
    expect(sprite.matrixWorld.elements[12]).toBeCloseTo(0, 10)
    expect(sprite.matrixWorld.elements[13]).toBeCloseTo(200, 10)

    const slot = instanceSlot(sprite)
    expect(slot[12]).toBeCloseTo(0, 10)
    expect(slot[13]).toBeCloseTo(200, 10)

    // Raycast at the rotated world position hits
    const rc = new Raycaster()
    rc.set(new Vector3(0, 200, 100), new Vector3(0, 0, -1))
    expect(rc.intersectObject(sprite)).toHaveLength(1)
    // The unrotated position misses
    rc.set(new Vector3(200, 0, 100), new Vector3(0, 0, -1))
    expect(rc.intersectObject(sprite)).toHaveLength(0)
  })

  it('raycasts correctly under a translated group even before the schedule runs', () => {
    const scene = new Scene()
    const group = new SpriteGroup()
    group.position.x = 500
    scene.add(group)

    const sprite = makeSprite(100)
    group.add(sprite)

    // NO scene.updateMatrixWorld — raycast issued pre-first-render must
    // self-refresh, including the group fold.
    const rc = new Raycaster()
    rc.set(new Vector3(500, 0, 100), new Vector3(0, 0, -1))
    expect(rc.intersectObject(sprite)).toHaveLength(1)
    rc.set(new Vector3(0, 0, 100), new Vector3(0, 0, -1))
    expect(rc.intersectObject(sprite)).toHaveLength(0)
  })

  it('does not double-apply the group transform through the batch mesh', () => {
    const scene = new Scene()
    const group = new SpriteGroup()
    group.position.set(500, 250, 0)
    scene.add(group)

    const sprite = makeSprite(100)
    group.add(sprite)

    scene.updateMatrixWorld(true)

    // The batch mesh must stay pinned at identity — the instance slots
    // already carry world transforms, so shader-side modelMatrix ×
    // instanceMatrix would otherwise apply the group transform twice.
    const batch = sprite._batchMesh!
    expect(batch.matrixWorld.equals(new Matrix4())).toBe(true)

    // Composite render transform (modelMatrix × instanceMatrix) equals the
    // sprite's world transform exactly.
    const composite = new Matrix4().fromArray(instanceSlot(sprite)).premultiply(batch.matrixWorld)
    expect(composite.elements[12]).toBe(500)
    expect(composite.elements[13]).toBe(250)
  })

  it('identity group keeps the direct local compose (fast path)', () => {
    const scene = new Scene()
    const group = new SpriteGroup()
    scene.add(group)

    const sprite = makeSprite(100)
    sprite.position.set(30, -40, 0)
    group.add(sprite)

    scene.updateMatrixWorld(true)

    expect(sprite.matrixWorld.elements[12]).toBe(30)
    expect(sprite.matrixWorld.elements[13]).toBe(-40)
    const slot = instanceSlot(sprite)
    expect(slot[12]).toBe(30)
    expect(slot[13]).toBe(-40)
  })
})

describe('renderOrder demotion under sceneGraphSync', () => {
  it('keeps a demoted standalone sprite in the graph across schedule runs', () => {
    const scene = new Scene()
    const group = new SpriteGroup()
    scene.add(group)

    const sprite = makeSprite(100)
    group.add(sprite)
    const sibling = makeSprite(100)
    group.add(sibling)

    scene.updateMatrixWorld(true)
    expect(sprite._batchMesh).not.toBeNull()

    // Explicit renderOrder write escapes the sortLayer system — the
    // sprite demotes to standalone and reparents under the group.
    sprite.renderOrder = 7
    expect(group.children.includes(sprite)).toBe(true)

    // The next schedule run's scene-graph prune must NOT evict the
    // demoted sprite (it only manages batch meshes).
    scene.updateMatrixWorld(true)
    expect(group.children.includes(sprite)).toBe(true)
    expect(sprite.visible).toBe(true)

    // And its world matrix composes through three again (standalone path)
    group.position.x = 100
    scene.updateMatrixWorld(true)
    expect(sprite.matrixWorld.elements[12]).toBe(100)
  })
})

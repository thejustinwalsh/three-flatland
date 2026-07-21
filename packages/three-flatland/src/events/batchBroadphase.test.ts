import { describe, it, expect } from 'vitest'
import { Raycaster, Vector2, Vector3, Texture } from 'three'
import { Flatland } from '../Flatland'
import { Sprite2D } from '../sprites/Sprite2D'

/**
 * Batch-root broadphase picking. Scene traversal hits the SpriteBatch (not each
 * sprite); the batch does a spatial-grid broadphase and returns the hit Sprite2D
 * as intersection.object. This is the acceleration on top of #205's per-sprite
 * correctness. These fail until SpriteBatch.raycast is implemented.
 */
function fl() {
  const flatland = new Flatland({ viewSize: 400 })
  flatland.resize(800, 800) // frustum half-width 200
  return flatland
}
function add(flatland: Flatland, x: number, y: number, scale = 100): Sprite2D {
  const s = new Sprite2D({ texture: new Texture(), anchor: [0.5, 0.5] })
  s.position.set(x, y, 0)
  s.scale.set(scale, scale, 1)
  flatland.add(s)
  return s
}

describe('batch-root broadphase picking', () => {
  it('scene traversal (intersectObjects(scene,true)) returns the hit SPRITE', () => {
    const flatland = fl()
    const a = add(flatland, 80, 0)
    add(flatland, -120, 0)
    flatland.scene.updateMatrixWorld(true)

    const rc = new Raycaster()
    rc.setFromCamera(new Vector2(80 / 200, 0), flatland.camera)
    const hits = rc.intersectObjects(flatland.scene.children, true)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.object).toBe(a) // the sprite, not the batch
  })

  it('hits only the sprite under the point; empty space misses', () => {
    const flatland = fl()
    add(flatland, 80, 0)
    flatland.scene.updateMatrixWorld(true)
    const rc = new Raycaster()
    rc.setFromCamera(new Vector2(80 / 200, 0), flatland.camera)
    expect(rc.intersectObjects(flatland.scene.children, true).length).toBe(1)
    rc.setFromCamera(new Vector2(-0.9, 0.9), flatland.camera) // empty
    expect(rc.intersectObjects(flatland.scene.children, true).length).toBe(0)
  })

  it('overlapping sprites resolve topmost by zIndex', () => {
    const flatland = fl()
    const back = add(flatland, 0, 0)
    const front = add(flatland, 0, 0)
    front.zIndex = 10
    flatland.scene.updateMatrixWorld(true)
    const rc = new Raycaster()
    rc.set(new Vector3(0, 0, 100), new Vector3(0, 0, -1))
    const hits = rc.intersectObjects(flatland.scene.children, true)
    expect(hits[0]!.object).toBe(front)
    expect(hits.map((h) => h.object)).toContain(back)
  })

  it('a moved sprite is found at its new position, not its old one', () => {
    const flatland = fl()
    const s = add(flatland, 0, 0)
    flatland.scene.updateMatrixWorld(true)
    s.position.set(120, 0, 0)
    flatland.scene.updateMatrixWorld(true)
    const rc = new Raycaster()
    rc.setFromCamera(new Vector2(120 / 200, 0), flatland.camera)
    expect(rc.intersectObjects(flatland.scene.children, true)[0]?.object).toBe(s)
    rc.setFromCamera(new Vector2(0, 0), flatland.camera) // old spot
    expect(rc.intersectObjects(flatland.scene.children, true).length).toBe(0)
  })
})

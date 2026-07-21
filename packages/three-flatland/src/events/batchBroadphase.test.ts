import { describe, it, expect } from 'vitest'
import { PerspectiveCamera, Raycaster, Vector2, Vector3, Texture } from 'three'
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

  // Under a PERSPECTIVE camera the ray converges, so its (x,y) at the sprite's
  // world z differs from its (x,y) at z=0. Localizing the broadphase on a
  // single z=0 plane would query the wrong grid cell and miss. The batch must
  // sweep the ray across its members' z-span. (Ortho rays are z-parallel, so
  // the other tests already cover the collapsed single-cell path.)
  it('finds a batched sprite at non-zero z off-axis under a perspective camera', () => {
    const flatland = fl()
    const cam = new PerspectiveCamera(50, 1, 0.1, 1000)
    cam.position.set(0, 0, 200)
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()

    const s = new Sprite2D({ texture: new Texture(), anchor: [0.5, 0.5] })
    s.position.set(100, 0, 100) // off-axis AND off the z=0 plane
    s.scale.set(20, 20, 1)
    flatland.add(s)
    flatland.scene.updateMatrixWorld(true)

    const proj = s.position.clone().project(cam) // aim NDC at the sprite centre
    const rc = new Raycaster()
    rc.setFromCamera(new Vector2(proj.x, proj.y), cam)

    // Narrow phase alone hits; the broadphase (scene traversal) must too.
    expect(rc.intersectObject(s).length).toBe(1)
    const hits = rc.intersectObjects(flatland.scene.children, true)
    expect(hits.some((h) => h.object === s)).toBe(true)
  })

  // Robustness: when the camera's Z lies INSIDE the batch's member z-span
  // (a near sprite in front + a sprite behind the camera), a naive
  // intersect-both-z-planes localizer aborts (the far plane is behind the ray).
  // The forward-clamped sweep must still find the reachable near sprite.
  it('finds a forward sprite when the camera sits inside the member z-span', () => {
    const flatland = fl()
    const cam = new PerspectiveCamera(50, 1, 0.1, 1000)
    cam.position.set(0, 0, 50)
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()

    // Behind the camera (z=100 > camera z=50) — pushes zMax past the origin.
    const behind = new Sprite2D({ texture: new Texture(), anchor: [0.5, 0.5] })
    behind.position.set(0, 0, 100)
    behind.scale.set(20, 20, 1)
    flatland.add(behind)
    // In front, off the z=0... on z=0, reachable.
    const front = new Sprite2D({ texture: new Texture(), anchor: [0.5, 0.5] })
    front.position.set(20, 0, 0)
    front.scale.set(20, 20, 1)
    flatland.add(front)
    flatland.scene.updateMatrixWorld(true)

    const proj = front.position.clone().project(cam)
    const rc = new Raycaster()
    rc.setFromCamera(new Vector2(proj.x, proj.y), cam)
    const hits = rc.intersectObjects(flatland.scene.children, true)
    expect(hits.some((h) => h.object === front)).toBe(true)
  })

  // A batched R3F sprite carrying its OWN custom raycast is NOT proxied (it
  // stays in R3F's per-object interaction list). It is still in the batch
  // grid, so without a guard the batch would ALSO invoke its raycast — twice
  // per pointer event. The batch must skip R3F-managed non-proxied candidates.
  it('does not double-invoke a non-proxied R3F sprite’s custom raycast', () => {
    const flatland = fl()
    const tex = new Texture() // shared → proxied + custom sprite land in ONE batch

    // A fake R3F root so proxyPickToBatch can splice/register.
    const interaction: object[] = []
    const root = { getState: () => ({ internal: { interaction, initialHits: [] } }) }

    // Proxied member (default raycast) — keeps the batch registered.
    const proxied = new Sprite2D({ texture: tex, anchor: [0.5, 0.5] })
    proxied.scale.set(100, 100, 1)
    ;(proxied as unknown as { __r3f: unknown }).__r3f = { root, eventCount: 1, handlers: { onClick() {} } }

    // Non-proxied member: R3F-managed + OWN custom raycast at the same spot.
    let customCalls = 0
    const custom = new Sprite2D({ texture: tex, anchor: [0.5, 0.5] })
    custom.scale.set(100, 100, 1)
    ;(custom as unknown as { __r3f: unknown }).__r3f = { root, eventCount: 1, handlers: { onClick() {} } }
    ;(custom as unknown as { raycast: unknown }).raycast = () => {
      customCalls++
    }

    flatland.add(proxied)
    flatland.add(custom)
    flatland.scene.updateMatrixWorld(true)

    // Both share one batch; the custom sprite was left in R3F's list, not proxied.
    const batch = proxied._batchMesh
    expect(batch).not.toBeNull()
    expect(proxied._pickProxied).toBe(true)
    expect(custom._pickProxied).toBe(false)
    expect(custom._batchMesh).toBe(batch) // same batch (shared texture)

    // Cast straight down through the overlapped centre and drive the batch.
    const rc = new Raycaster()
    rc.set(new Vector3(0, 0, 100), new Vector3(0, 0, -1))
    const intersects: import('three').Intersection[] = []
    batch!.raycast(rc, intersects)

    // The batch hit-tested the proxied sprite but NOT the custom one — R3F's
    // own list owns that; invoking it here would be the second call.
    expect(customCalls).toBe(0)
    expect(intersects.some((h) => h.object === proxied)).toBe(true)
    expect(intersects.some((h) => h.object === custom)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { Raycaster, Vector2, Texture } from 'three'
import { Flatland } from '../Flatland'
import { Sprite2D } from '../sprites/Sprite2D'

/**
 * Objects added via `flatland.add()` live in Flatland's internal scene, which
 * has `matrixWorldAutoUpdate` disabled — matrices refresh once per frame inside
 * `render()`. A raycast from user code runs outside that, so `raycast()` must
 * refresh its own world matrix or it tests against an identity transform.
 */
describe('raycasting objects added via flatland.add()', () => {
  it('hits away from the origin, not just dead centre', () => {
    const flatland = new Flatland({ viewSize: 400 })
    flatland.resize(800, 450)

    const sprite = new Sprite2D({ texture: new Texture(), anchor: [0.5, 0.5] })
    sprite.scale.set(150, 150, 1)
    flatland.add(sprite)

    const rc = new Raycaster()
    rc.setFromCamera(new Vector2(0, 0), flatland.camera)
    const centre = rc.intersectObject(sprite).length

    // ~53 world units in: well inside a 150-unit sprite, and far outside the
    // 0.5-unit radius an unrefreshed identity matrix would imply.
    rc.setFromCamera(new Vector2(0.15, 0.15), flatland.camera)
    const offCentre = rc.intersectObject(sprite).length

    expect({ centre, offCentre, scaleInMatrix: sprite.matrixWorld.elements[0] }).toEqual({
      centre: 1,
      offCentre: 1,
      scaleInMatrix: 150,
    })
  })

  it('misses outside the sprite', () => {
    const flatland = new Flatland({ viewSize: 400 })
    flatland.resize(800, 450)
    const sprite = new Sprite2D({ texture: new Texture(), anchor: [0.5, 0.5] })
    sprite.scale.set(150, 150, 1)
    flatland.add(sprite)

    const rc = new Raycaster()
    rc.setFromCamera(new Vector2(0.9, 0.9), flatland.camera)
    expect(rc.intersectObject(sprite)).toHaveLength(0)
  })
})

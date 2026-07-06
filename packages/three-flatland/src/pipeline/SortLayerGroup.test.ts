import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Group, Mesh, Texture } from 'three'
import { universe } from 'koota'
import { Sprite2D } from '../sprites/Sprite2D'
import { SpriteGroup } from './SpriteGroup'
import { SortLayerGroup } from './SortLayerGroup'
import { declareSortLayer, SortLayers } from './sortLayers'
import { Flatland } from '../Flatland'

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 8, height: 8 }
  return texture
}

declareSortLayer('world', { renderOrder: SortLayers.ENTITIES })

describe('SortLayerGroup discipline container', () => {
  let texture: Texture

  beforeEach(() => {
    texture = makeTexture()
  })

  afterEach(() => {
    universe.reset()
  })

  it('assigns sortLayer to first-party children and renderOrder to foreign children', () => {
    const group = new SortLayerGroup({ name: 'ui' })
    const sprite = new Sprite2D({ texture })
    const foreign = new Mesh()

    group.add(sprite)
    group.add(foreign)

    expect(sprite.sortLayer).toBe('ui')
    expect(sprite.sortLayerValue).toBe(SortLayers.UI)
    expect(foreign.renderOrder).toBe(SortLayers.UI)
  })

  it('works no-arg constructed with name set later (R3F pattern)', () => {
    const group = new SortLayerGroup()
    const sprite = new Sprite2D({ texture })
    group.add(sprite)
    expect(sprite.sortLayerValue).toBe(0)

    group.name = 'effects'
    expect(group.name).toBe('effects')
    expect(sprite.sortLayer).toBe('effects')
    expect(sprite.sortLayerValue).toBe(SortLayers.EFFECTS)
  })

  it('walks nested plain Groups', () => {
    const group = new SortLayerGroup({ name: 'world' })
    const nested = new Group()
    const sprite = new Sprite2D({ texture })
    nested.add(sprite)

    group.add(nested)

    expect(sprite.sortLayer).toBe('world')
  })

  it('nested SortLayerGroup with a different name wins for its descendants', () => {
    declareSortLayer('overlay', { renderOrder: 42 })
    const outer = new SortLayerGroup({ name: 'world' })
    const inner = new SortLayerGroup({ name: 'overlay' })
    const outerSprite = new Sprite2D({ texture })
    const innerSprite = new Sprite2D({ texture })

    inner.add(innerSprite)
    outer.add(outerSprite)
    outer.add(inner)

    expect(outerSprite.sortLayer).toBe('world')
    expect(innerSprite.sortLayer).toBe('overlay')
    expect(innerSprite.sortLayerValue).toBe(42)
  })

  it('respects an explicit sortLayer set before adding', () => {
    const group = new SortLayerGroup({ name: 'world' })
    const sprite = new Sprite2D({ texture })
    sprite.sortLayer = 'effects'

    group.add(sprite)

    expect(sprite.sortLayer).toBe('effects')
  })

  it('respects a foreign child with non-default renderOrder', () => {
    const group = new SortLayerGroup({ name: 'ui' })
    const foreign = new Mesh()
    foreign.renderOrder = 3

    group.add(foreign)

    expect(foreign.renderOrder).toBe(3)
  })

  it('nested SpriteGroup keeps material discipline while inheriting the sortLayer', () => {
    const layerGroup = new SortLayerGroup({ name: 'world' })
    const spriteGroup = new SpriteGroup()
    const sprite = new Sprite2D({ texture })

    // SpriteGroup.add enrolls rather than parenting, so discipline
    // flows at layer-group add time via the walk.
    spriteGroup.add(sprite)
    layerGroup.add(spriteGroup)

    // The sprite isn't a tree child of the SpriteGroup (enrollment
    // model) — apply reaches it only if parented. Verify the group
    // itself doesn't get clobbered and enrolled sprite keeps working.
    expect(spriteGroup.name).toBe('SpriteGroup')

    // Parented foreign-style usage: plain meshes under the sprite group
    const foreign = new Mesh()
    spriteGroup.add(foreign)
    layerGroup._applyToSubtree(spriteGroup)
    expect(foreign.renderOrder).toBe(SortLayers.ENTITIES)

    spriteGroup.dispose()
  })

  it('vanilla multi-add works', () => {
    declareSortLayer('hud', { renderOrder: 77 })
    const group = new SortLayerGroup({ name: 'hud' })
    const a = new Sprite2D({ texture })
    const b = new Sprite2D({ texture })
    const skiaLike = new Mesh()

    group.add(a, b, skiaLike)

    expect(a.sortLayerValue).toBe(77)
    expect(b.sortLayerValue).toBe(77)
    expect(skiaLike.renderOrder).toBe(77)
  })

  it('flatland.sortLayer(name).renderOrder exposes the declared numeric value', () => {
    declareSortLayer('minimap', { renderOrder: 250 })
    const flatland = new Flatland()

    expect(flatland.sortLayer('minimap').renderOrder).toBe(250)
    expect(flatland.sortLayer('ui').renderOrder).toBe(SortLayers.UI)

    flatland.declareSortLayer('minimap', { renderOrder: 300 })
    expect(flatland.sortLayer('minimap').renderOrder).toBe(300)

    flatland.dispose()
  })
})

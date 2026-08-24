import { describe, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import { vec4 } from 'three/tsl'
import { Flatland } from './Flatland'
import { LightingContext } from './ecs/traits'
import { select, type World } from './ecs/runtime'
import { Light2D } from './lights/Light2D'
import { createLightEffect } from './lights/LightEffect'
import { createMaterialEffect } from './materials/MaterialEffect'
import { Sprite2DMaterial } from './materials/Sprite2DMaterial'
import { Sprite2D } from './sprites/Sprite2D'
import { TileMap2D } from './tilemap/TileMap2D'
import type { TileMapData } from './tilemap/types'
import { subscribeSpriteMaterialChanges } from './internal/ownership-observers'

const OwnershipLight = createLightEffect({
  name: 'material_ownership_light',
  schema: { ambient: 1 },
  light: () => (context) => vec4(context.color.rgb, context.color.a),
})

const OwnershipTileEffect = createMaterialEffect({
  name: 'material_ownership_tile',
  schema: { amount: 1 },
  node: ({ inputColor }) => inputColor,
})

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 32, height: 32 }
  return texture
}

function makeMaterial(): Sprite2DMaterial {
  return new Sprite2DMaterial({ map: makeTexture() })
}

function makeSprite(material = makeMaterial()): Sprite2D {
  return new Sprite2D({ material, texture: material.map ?? makeTexture() })
}

function makeMapData(): TileMapData {
  const texture = makeTexture()
  return {
    width: 2,
    height: 2,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    infinite: false,
    tilesets: [
      {
        name: 'tiles',
        firstGid: 1,
        tileWidth: 16,
        tileHeight: 16,
        imageWidth: 32,
        imageHeight: 32,
        columns: 2,
        tileCount: 4,
        tiles: new Map(),
        texture,
      },
    ],
    tileLayers: [
      {
        name: 'ground',
        id: 1,
        width: 2,
        height: 2,
        data: new Uint32Array([1, 1, 1, 1]),
      },
    ],
    objectLayers: [],
  }
}

function lightingContext(flatland: Flatland) {
  const world = flatland.world as World
  const entity = world.view(select(LightingContext))[0]!
  return world.read(entity, LightingContext)!
}

function trackedMaterials(flatland: Flatland): Set<Sprite2DMaterial> {
  return Reflect.get(flatland, '_spriteMaterials') as Set<Sprite2DMaterial>
}

function materialRefCounts(flatland: Flatland): Map<Sprite2DMaterial, number> {
  return Reflect.get(flatland, '_spriteMaterialRefCounts') as Map<Sprite2DMaterial, number>
}

describe('Flatland material ownership', () => {
  it('rolls back one internal material notification without recursive setter reentry', () => {
    const flatland = new Flatland()
    const previous = makeMaterial()
    const replacement = makeMaterial()
    const sprite = makeSprite(previous)
    flatland.add(sprite)
    const previousEntity = sprite.entity
    const previousGeometry = sprite.geometry
    let calls = 0
    const unsubscribe = subscribeSpriteMaterialChanges(sprite, () => {
      calls++
      throw 0
    })

    let thrown: unknown
    try {
      sprite.material = replacement
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(0)
    expect(calls).toBe(1)
    expect(sprite.material).toBe(previous)
    expect(sprite.entity).toBe(previousEntity)
    expect(sprite.geometry).toBe(previousGeometry)
    expect(trackedMaterials(flatland)).toEqual(new Set([previous]))
    expect(materialRefCounts(flatland)).toEqual(new Map([[previous, 1]]))

    unsubscribe()
    flatland.remove(sprite)
    sprite.dispose()
    flatland.dispose()
  })

  it('finishes sprite cleanup before rethrowing an exact geometry-disposal error', () => {
    const flatland = new Flatland()
    const sprite = makeSprite()
    const geometryDispose = vi.spyOn(sprite.geometry, 'dispose')
    sprite.geometry.addEventListener('dispose', () => {
      throw 0
    })
    flatland.add(sprite)

    let thrown: unknown
    try {
      sprite.dispose()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(0)
    expect(sprite.entity).toBeNull()
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(flatland.spriteGroup.spriteCount).toBe(0)
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)
    expect(() => sprite.dispose()).not.toThrow()
    flatland.dispose()
  })

  it('moves lighting/global ownership when a live sprite replaces its material', () => {
    const flatland = new Flatland()
    flatland.setLighting(new OwnershipLight())
    const materialA = makeMaterial()
    const materialB = makeMaterial()
    const sprite = makeSprite(materialA)
    flatland.add(sprite)

    sprite.material = materialB

    const context = lightingContext(flatland)
    expect(trackedMaterials(flatland).has(materialA)).toBe(false)
    expect(context.materials.has(materialA)).toBe(false)
    expect(trackedMaterials(flatland).has(materialB)).toBe(true)
    expect(context.materials.has(materialB)).toBe(true)
    expect(materialB.globalUniforms).toBe(flatland.globals)
    expect(materialB.colorTransform).toBe(context.wrappedLightFn)
    expect(materialB.requiredChannels).toBe(context.requiredChannels)

    flatland.remove(sprite)
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(context.materials.size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)
    flatland.dispose()
  })

  it('defers replaced tile material disposal while a live sprite shares it', () => {
    const flatland = new Flatland()
    const tileMap = new TileMap2D({ data: makeMapData() })
    const shared = tileMap.getLayerMaterialAt(0)!
    const sprite = makeSprite(shared)
    const dispose = vi.spyOn(shared, 'dispose')
    flatland.add(tileMap, sprite)

    tileMap.addEffect(new OwnershipTileEffect())

    expect(dispose).not.toHaveBeenCalled()
    expect(sprite.material).toBe(shared)
    expect(trackedMaterials(flatland).has(shared)).toBe(true)
    flatland.remove(sprite)
    expect(dispose).toHaveBeenCalledTimes(1)

    sprite.dispose()
    tileMap.dispose()
    flatland.dispose()
  })

  it('defers data-rebuild material and texture disposal while a live sprite shares them', () => {
    const flatland = new Flatland()
    const original = makeMapData()
    const tileMap = new TileMap2D({ data: original })
    const shared = tileMap.getLayerMaterialAt(0)!
    const sprite = makeSprite(shared)
    const disposeMaterial = vi.spyOn(shared, 'dispose')
    const disposeTexture = vi.spyOn(original.tilesets[0]!.texture!, 'dispose')
    flatland.add(tileMap, sprite)

    tileMap.data = makeMapData()

    expect(disposeMaterial).not.toHaveBeenCalled()
    expect(disposeTexture).not.toHaveBeenCalled()
    flatland.remove(sprite)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
    expect(disposeTexture).toHaveBeenCalledTimes(1)

    sprite.dispose()
    tileMap.dispose()
    flatland.dispose()
  })

  it('defers terminal tile material and texture disposal while a live sprite shares them', () => {
    const flatland = new Flatland()
    const data = makeMapData()
    const tileMap = new TileMap2D({ data })
    const shared = tileMap.getLayerMaterialAt(0)!
    const sprite = makeSprite(shared)
    const disposeMaterial = vi.spyOn(shared, 'dispose')
    const disposeTexture = vi.spyOn(data.tilesets[0]!.texture!, 'dispose')
    flatland.add(tileMap, sprite)

    tileMap.dispose()

    expect(disposeMaterial).not.toHaveBeenCalled()
    expect(disposeTexture).not.toHaveBeenCalled()
    expect(sprite.material).toBe(shared)
    flatland.remove(sprite)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
    expect(disposeTexture).toHaveBeenCalledTimes(1)

    sprite.dispose()
    flatland.dispose()
  })

  it('drains pending generated materials first-error-safe during terminal Flatland disposal', () => {
    const flatland = new Flatland()
    const tileMap = new TileMap2D({ data: makeMapData() })
    const shared = tileMap.getLayerMaterialAt(0)!
    const sprite = makeSprite(shared)
    const dispose = vi.spyOn(shared, 'dispose')
    shared.addEventListener('dispose', () => {
      throw 0
    })
    flatland.add(tileMap, sprite)
    tileMap.addEffect(new OwnershipTileEffect())

    let thrown: unknown
    try {
      flatland.dispose()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)
    sprite.dispose()
    tileMap.dispose()
  })

  it('holds a pending generated material across cross-Flatland sprite transfer', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const tileMap = new TileMap2D({ data: makeMapData() })
    const shared = tileMap.getLayerMaterialAt(0)!
    const sprite = makeSprite(shared)
    const dispose = vi.spyOn(shared, 'dispose')
    source.add(tileMap, sprite)
    tileMap.addEffect(new OwnershipTileEffect())

    destination.add(sprite)

    expect(dispose).not.toHaveBeenCalled()
    expect(sprite.material).toBe(shared)
    expect(trackedMaterials(source).has(shared)).toBe(false)
    expect(trackedMaterials(destination).has(shared)).toBe(true)
    destination.remove(sprite)
    expect(dispose).toHaveBeenCalledTimes(1)

    sprite.dispose()
    tileMap.dispose()
    source.dispose()
    destination.dispose()
  })

  it('commits material ownership before rethrowing pending-retirement cleanup errors', () => {
    const flatland = new Flatland()
    const tileMap = new TileMap2D({ data: makeMapData() })
    const shared = tileMap.getLayerMaterialAt(0)!
    const sprite = makeSprite(shared)
    const replacement = makeMaterial()
    const dispose = vi.spyOn(shared, 'dispose')
    shared.addEventListener('dispose', () => {
      throw false
    })
    flatland.add(tileMap, sprite)
    tileMap.addEffect(new OwnershipTileEffect())

    let thrown: unknown
    try {
      sprite.material = replacement
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(false)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(sprite.material).toBe(replacement)
    expect(trackedMaterials(flatland).has(shared)).toBe(false)
    expect(trackedMaterials(flatland).has(replacement)).toBe(true)
    expect(materialRefCounts(flatland).get(replacement)).toBe(1)

    flatland.remove(sprite)
    sprite.dispose()
    tileMap.dispose()
    flatland.dispose()
  })

  it('always finalizes pending retirement after a post-notification material setup failure', () => {
    const flatland = new Flatland()
    const tileMap = new TileMap2D({ data: makeMapData() })
    const shared = tileMap.getLayerMaterialAt(0)!
    const sprite = makeSprite(shared)
    const replacement = makeMaterial()
    const dispose = vi.spyOn(shared, 'dispose')
    flatland.add(tileMap, sprite)
    tileMap.addEffect(new OwnershipTileEffect())
    const setAttribute = vi.spyOn(sprite.geometry, 'setAttribute').mockImplementation(() => {
      throw 0
    })

    let thrown: unknown
    try {
      sprite.material = replacement
    } catch (error) {
      thrown = error
    }

    setAttribute.mockRestore()
    expect(thrown).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(sprite.material).toBe(replacement)
    expect(trackedMaterials(flatland).has(shared)).toBe(false)
    expect(trackedMaterials(flatland).has(replacement)).toBe(true)
    flatland.remove(sprite)
    expect(dispose).toHaveBeenCalledTimes(1)
    sprite.dispose()
    tileMap.dispose()
    flatland.dispose()
  })

  it('releases transfer holds after a throwing tilemap removal rolls back', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const tileMap = new TileMap2D({ data: makeMapData() })
    const shared = tileMap.getLayerMaterialAt(0)!
    const dispose = vi.spyOn(shared, 'dispose')
    const throwOnRemoved = (): void => {
      throw 0
    }
    tileMap.addEventListener('removed', throwOnRemoved)
    source.add(tileMap)

    expect(() => destination.add(tileMap)).toThrow()
    tileMap.removeEventListener('removed', throwOnRemoved)
    const sprite = makeSprite(shared)
    source.add(sprite)
    tileMap.addEffect(new OwnershipTileEffect())
    source.remove(sprite)

    expect(dispose).toHaveBeenCalledTimes(1)
    sprite.dispose()
    tileMap.dispose()
    source.dispose()
    destination.dispose()
  })

  it('keeps a shared material until its final sprite owner leaves', () => {
    const flatland = new Flatland()
    const shared = makeMaterial()
    const replacement = makeMaterial()
    const first = makeSprite(shared)
    const second = makeSprite(shared)
    flatland.add(first, second)

    first.material = replacement
    expect(materialRefCounts(flatland).get(shared)).toBe(1)
    expect(materialRefCounts(flatland).get(replacement)).toBe(1)

    flatland.remove(first)
    expect(trackedMaterials(flatland).has(replacement)).toBe(false)
    expect(trackedMaterials(flatland).has(shared)).toBe(true)

    flatland.remove(second)
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)
    flatland.dispose()
  })

  it('retires every Flatland ownership registry when a directly owned sprite disposes', () => {
    const flatland = new Flatland()
    flatland.setLighting(new OwnershipLight())
    const material = makeMaterial()
    const sprite = makeSprite(material)
    flatland.add(sprite)
    const context = lightingContext(flatland)

    sprite.dispose()

    expect(flatland.spriteGroup.spriteCount).toBe(0)
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)
    expect(context.materials.size).toBe(0)
    expect((Reflect.get(flatland, '_spriteOwnedMaterials') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(flatland, '_spriteMaterialSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(flatland, '_spriteDisposeSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(flatland, '_pendingChannelValidation') as Set<unknown>).size).toBe(0)
    expect(material.globalUniforms).toBeNull()
    expect(material.colorTransform).toBeNull()
    expect(material.requiredChannels.size).toBe(0)

    const next = new Flatland()
    const nextSprite = makeSprite(material)
    expect(() => next.add(nextSprite)).not.toThrow()
    expect(material.globalUniforms).toBe(next.globals)
    next.remove(nextSprite)
    next.dispose()
    flatland.dispose()
  })

  it('retires Flatland ownership when SpriteGroup removal throws after release', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const material = makeMaterial()
    const sprite = makeSprite(material)
    source.add(sprite)
    const remove = source.spriteGroup.remove.bind(source.spriteGroup)
    vi.spyOn(source.spriteGroup, 'remove').mockImplementation((spriteOrObject, ...rest) => {
      remove(spriteOrObject, ...rest)
      throw 0
    })

    let didThrow = false
    let thrown: unknown
    try {
      source.remove(sprite)
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(source.spriteGroup.spriteCount).toBe(0)
    expect(trackedMaterials(source).size).toBe(0)
    expect(materialRefCounts(source).size).toBe(0)
    expect((Reflect.get(source, '_spriteOwnedMaterials') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(source, '_spriteMaterialSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(source, '_spriteDisposeSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect(() => destination.add(sprite)).not.toThrow()
    expect(destination.spriteGroup.spriteCount).toBe(1)
    expect(material.globalUniforms).toBe(destination.globals)

    destination.remove(sprite)
    source.dispose()
    destination.dispose()
  })

  it('keeps shared material ownership until the final directly owned sprite disposes', () => {
    const flatland = new Flatland()
    const shared = makeMaterial()
    const first = makeSprite(shared)
    const second = makeSprite(shared)
    flatland.add(first, second)

    first.dispose()
    expect(flatland.spriteGroup.spriteCount).toBe(1)
    expect(trackedMaterials(flatland)).toEqual(new Set([shared]))
    expect(materialRefCounts(flatland)).toEqual(new Map([[shared, 1]]))

    second.dispose()
    expect(flatland.spriteGroup.spriteCount).toBe(0)
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)

    flatland.dispose()
  })

  it('rebinds globals and retires the previous owner during Three-style cross-Flatland reparenting', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const material = makeMaterial()
    const sprite = makeSprite(material)
    source.add(sprite)

    destination.add(sprite)

    expect(source.spriteGroup.spriteCount).toBe(0)
    expect(trackedMaterials(source).size).toBe(0)
    expect(materialRefCounts(source).size).toBe(0)
    expect(destination.spriteGroup.spriteCount).toBe(1)
    expect(trackedMaterials(destination)).toEqual(new Set([material]))
    expect(material.globalUniforms).toBe(destination.globals)

    destination.remove(sprite)
    source.dispose()
    destination.dispose()
  })

  it('restores authored Sprite material state across lit-A, lit-B, and unlit ownership', () => {
    const litA = new Flatland()
    const litB = new Flatland()
    const unlit = new Flatland()
    litA.setLighting(new OwnershipLight())
    litB.setLighting(new OwnershipLight())
    const material = makeMaterial()
    const authoredTransform: NonNullable<Sprite2DMaterial['colorTransform']> = (context) =>
      vec4(context.color.rgb, context.color.a)
    const authoredChannels = new Set(['authored'])
    material.colorTransform = authoredTransform
    material.requiredChannels = authoredChannels
    const sprite = makeSprite(material)

    litA.add(sprite)
    expect(material.colorTransform).toBe(lightingContext(litA).wrappedLightFn)
    litB.add(sprite)
    expect(material.colorTransform).toBe(lightingContext(litB).wrappedLightFn)
    unlit.add(sprite)
    expect(material.colorTransform).toBe(authoredTransform)
    expect(material.requiredChannels).toBe(authoredChannels)
    expect(material.globalUniforms).toBe(unlit.globals)

    unlit.remove(sprite)
    sprite.dispose()
    litA.dispose()
    litB.dispose()
    unlit.dispose()
  })

  it('restores authored TileMap material state across lit-A, lit-B, and unlit ownership', () => {
    const litA = new Flatland()
    const litB = new Flatland()
    const unlit = new Flatland()
    litA.setLighting(new OwnershipLight())
    litB.setLighting(new OwnershipLight())
    const tileMap = new TileMap2D({ data: makeMapData() })
    const material = tileMap.getLayerMaterialAt(0)!
    const authoredTransform: NonNullable<Sprite2DMaterial['colorTransform']> = (context) =>
      vec4(context.color.rgb, context.color.a)
    const authoredChannels = new Set(['authored'])
    material.colorTransform = authoredTransform
    material.requiredChannels = authoredChannels

    litA.add(tileMap)
    expect(material.colorTransform).toBe(lightingContext(litA).wrappedLightFn)
    litB.add(tileMap)
    expect(material.colorTransform).toBe(lightingContext(litB).wrappedLightFn)
    unlit.add(tileMap)
    expect(material.colorTransform).toBe(authoredTransform)
    expect(material.requiredChannels).toBe(authoredChannels)
    expect(material.globalUniforms).toBe(unlit.globals)

    unlit.remove(tileMap)
    tileMap.dispose()
    litA.dispose()
    litB.dispose()
    unlit.dispose()
  })

  it('rejects simultaneous cross-Flatland material sharing without changing either owner', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const material = makeMaterial()
    const sourceSprite = makeSprite(material)
    const destinationSprite = makeSprite(material)
    source.add(sourceSprite)

    expect(() => destination.add(destinationSprite)).toThrow(/cannot be shared by multiple Flatland/)
    expect(source.spriteGroup.spriteCount).toBe(1)
    expect(trackedMaterials(source)).toEqual(new Set([material]))
    expect(materialRefCounts(source)).toEqual(new Map([[material, 1]]))
    expect(destination.spriteGroup.spriteCount).toBe(0)
    expect(trackedMaterials(destination).size).toBe(0)
    expect(materialRefCounts(destination).size).toBe(0)
    expect(material.globalUniforms).toBe(source.globals)

    source.remove(sourceSprite)
    source.dispose()
    destination.dispose()
  })

  it('rejects a shared-material sprite reparent before removing it from its source Flatland', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const shared = makeMaterial()
    const moving = makeSprite(shared)
    const retained = makeSprite(shared)
    source.add(moving, retained)

    expect(() => destination.add(moving)).toThrow(/cannot be shared by multiple Flatland/)
    expect(source.spriteGroup.spriteCount).toBe(2)
    expect(materialRefCounts(source)).toEqual(new Map([[shared, 2]]))
    expect(trackedMaterials(source)).toEqual(new Set([shared]))
    expect(destination.spriteGroup.spriteCount).toBe(0)
    expect(materialRefCounts(destination).size).toBe(0)

    source.remove(moving, retained)
    source.dispose()
    destination.dispose()
  })

  it('rolls back a live material setter when the replacement belongs to another Flatland', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const materialA = makeMaterial()
    const materialB = makeMaterial()
    const sourceSprite = makeSprite(materialA)
    const destinationSprite = makeSprite(materialB)
    source.add(sourceSprite)
    destination.add(destinationSprite)

    expect(() => {
      sourceSprite.material = materialB
    }).toThrow(/cannot be shared by multiple Flatland/)
    expect(sourceSprite.material).toBe(materialA)
    expect(trackedMaterials(source)).toEqual(new Set([materialA]))
    expect(materialRefCounts(source)).toEqual(new Map([[materialA, 1]]))
    expect(trackedMaterials(destination)).toEqual(new Set([materialB]))
    expect(materialRefCounts(destination)).toEqual(new Map([[materialB, 1]]))

    source.remove(sourceSprite)
    destination.remove(destinationSprite)
    source.dispose()
    destination.dispose()
  })

  it('reconciles repeated tilemap material rebuilds with active lighting without retention growth', () => {
    const flatland = new Flatland()
    flatland.setLighting(new OwnershipLight())
    const tileMap = new TileMap2D({ data: makeMapData() })
    flatland.add(tileMap)
    const context = lightingContext(flatland)
    let retired = tileMap.getLayerMaterialAt(0)!

    for (let index = 0; index < 3; index++) {
      if (index === 1) tileMap.chunkSize = 1
      else tileMap.data = makeMapData()
      const current = tileMap.getLayerMaterialAt(0)!
      expect(current).not.toBe(retired)
      expect(trackedMaterials(flatland)).toEqual(new Set([current]))
      expect(context.materials).toEqual(new Set([current]))
      expect(materialRefCounts(flatland)).toEqual(new Map([[current, 1]]))
      expect(current.globalUniforms).toBe(flatland.globals)
      expect(current.colorTransform).toBe(context.wrappedLightFn)
      expect(current.requiredChannels).toBe(context.requiredChannels)
      retired = current
    }

    flatland.remove(tileMap)
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(context.materials.size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)
    tileMap.dispose()
    flatland.dispose()
  })

  it('moves tilemap layer-material ownership between Flatland instances on reparent', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const tileMap = new TileMap2D({ data: makeMapData() })
    const material = tileMap.getLayerMaterialAt(0)!
    source.add(tileMap)

    destination.add(tileMap)

    expect(source.scene.children).toEqual([source.spriteGroup])
    expect(trackedMaterials(source).size).toBe(0)
    expect(destination.scene.children).toEqual([destination.spriteGroup, tileMap])
    expect(trackedMaterials(destination)).toEqual(new Set([material]))
    expect(material.globalUniforms).toBe(destination.globals)

    destination.remove(tileMap)
    tileMap.dispose()
    source.dispose()
    destination.dispose()
  })

  it('rejects a shared tilemap-material reparent before removing it from its source Flatland', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const tileMap = new TileMap2D({ data: makeMapData() })
    const shared = tileMap.getLayerMaterialAt(0)!
    const retained = makeSprite(shared)
    source.add(tileMap, retained)

    expect(() => destination.add(tileMap)).toThrow(/cannot be shared by multiple Flatland/)
    expect(source.scene.children).toEqual([source.spriteGroup, tileMap])
    expect(source.spriteGroup.spriteCount).toBe(1)
    expect(materialRefCounts(source)).toEqual(new Map([[shared, 2]]))
    expect(trackedMaterials(source)).toEqual(new Set([shared]))
    expect(destination.scene.children).toEqual([destination.spriteGroup])
    expect(materialRefCounts(destination).size).toBe(0)

    source.remove(tileMap, retained)
    tileMap.dispose()
    source.dispose()
    destination.dispose()
  })

  it('detaches a disposed tilemap canonically and rejects later untracked rebuilds', () => {
    const flatland = new Flatland()
    flatland.setLighting(new OwnershipLight())
    const tileMap = new TileMap2D({ data: makeMapData() })
    flatland.add(tileMap)
    const context = lightingContext(flatland)

    tileMap.dispose()

    expect(flatland.scene.children).toEqual([flatland.spriteGroup])
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)
    expect(context.materials.size).toBe(0)
    expect((Reflect.get(flatland, '_tileMapOwnedMaterials') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(flatland, '_tileMapMaterialSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(flatland, '_tileMapDisposeSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect(tileMap.data).toBeNull()
    expect(() => {
      tileMap.data = makeMapData()
    }).toThrow(/after dispose/)
    expect(tileMap.getLayers()).toEqual([])

    flatland.dispose()
  })

  it('finishes tilemap resource and Flatland ownership cleanup when an earlier removed listener throws 0', () => {
    const flatland = new Flatland()
    flatland.setLighting(new OwnershipLight())
    const data = makeMapData()
    const tileMap = new TileMap2D({ data })
    const material = tileMap.getLayerMaterialAt(0)!
    const disposeMaterial = vi.spyOn(material, 'dispose')
    const disposeTexture = vi.spyOn(data.tilesets[0]!.texture!, 'dispose')
    tileMap.addEventListener('removed', () => {
      throw 0
    })
    flatland.add(tileMap)

    let didThrow = false
    let thrown: unknown
    try {
      tileMap.dispose()
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(tileMap.data).toBeNull()
    expect(tileMap.getLayers()).toEqual([])
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
    expect(disposeTexture).toHaveBeenCalledTimes(1)
    expect(flatland.scene.children).toEqual([flatland.spriteGroup])
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)
    expect(lightingContext(flatland).materials.size).toBe(0)
    expect((Reflect.get(flatland, '_tileMapOwnedMaterials') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(flatland, '_tileMapMaterialSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(flatland, '_tileMapDisposeSubscriptions') as Map<unknown, unknown>).size).toBe(0)

    // Terminal cleanup is idempotent even though the first call rethrew the
    // exact user value after completing every owned resource release.
    expect(() => tileMap.dispose()).not.toThrow()
    flatland.dispose()
  })

  it('rejects a disposed sprite before transfer or destination ownership publication', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const sprite = makeSprite()
    source.add(sprite)
    sprite.dispose()

    expect(() => destination.add(sprite)).toThrow('Flatland.add: cannot add a disposed Sprite2D')
    expect(source.spriteGroup.spriteCount).toBe(0)
    expect(destination.spriteGroup.spriteCount).toBe(0)
    expect(destination.scene.children).toEqual([destination.spriteGroup])
    expect(trackedMaterials(source).size).toBe(0)
    expect(trackedMaterials(destination).size).toBe(0)
    expect(materialRefCounts(source).size).toBe(0)
    expect(materialRefCounts(destination).size).toBe(0)
    expect((Reflect.get(destination, '_spriteOwnedMaterials') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(destination, '_spriteMaterialSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(destination, '_spriteDisposeSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(destination, '_pendingChannelValidation') as Set<unknown>).size).toBe(0)
    expect(sprite.entity).toBeNull()

    source.dispose()
    destination.dispose()
  })

  it('rejects a disposed tilemap before transfer or destination ownership publication', () => {
    const source = new Flatland()
    const destination = new Flatland()
    const tileMap = new TileMap2D({ data: makeMapData() })
    source.add(tileMap)
    tileMap.dispose()

    expect(() => destination.add(tileMap)).toThrow('Flatland.add: cannot add a disposed TileMap2D')
    expect(source.scene.children).toEqual([source.spriteGroup])
    expect(destination.scene.children).toEqual([destination.spriteGroup])
    expect(trackedMaterials(source).size).toBe(0)
    expect(trackedMaterials(destination).size).toBe(0)
    expect(materialRefCounts(source).size).toBe(0)
    expect(materialRefCounts(destination).size).toBe(0)
    expect((Reflect.get(destination, '_tileMapOwnedMaterials') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(destination, '_tileMapMaterialSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect((Reflect.get(destination, '_tileMapDisposeSubscriptions') as Map<unknown, unknown>).size).toBe(0)
    expect(tileMap.parent).toBeNull()

    source.dispose()
    destination.dispose()
  })

  it('clears every coupled registry and remains bounded across refill cycles', () => {
    const flatland = new Flatland()
    flatland.setLighting(new OwnershipLight())
    const context = lightingContext(flatland)

    for (let cycle = 0; cycle < 2; cycle++) {
      const sprite = makeSprite()
      const tileMap = new TileMap2D({ data: makeMapData() })
      const light = new Light2D()
      flatland.add(sprite, tileMap, light)

      expect((Reflect.get(flatland, '_pendingChannelValidation') as Set<Sprite2D>).has(sprite)).toBe(true)
      expect(context.materials.size).toBe(2)
      expect(context.lights).toContain(light)

      flatland.clear()

      expect(flatland.spriteGroup.spriteCount).toBe(0)
      expect(flatland.scene.children).toEqual([flatland.spriteGroup])
      expect(trackedMaterials(flatland).size).toBe(0)
      expect(materialRefCounts(flatland).size).toBe(0)
      expect((Reflect.get(flatland, '_spriteOwnedMaterials') as Map<unknown, unknown>).size).toBe(0)
      expect((Reflect.get(flatland, '_tileMapOwnedMaterials') as Map<unknown, unknown>).size).toBe(0)
      expect(Reflect.get(flatland, '_lights')).toHaveLength(0)
      expect((Reflect.get(flatland, '_pendingChannelValidation') as Set<Sprite2D>).size).toBe(0)
      expect(context.materials.size).toBe(0)
      expect(context.lights).toHaveLength(0)

      tileMap.dispose()
    }

    flatland.dispose()
  })

  it('finishes coupled cleanup and rethrows an exact falsy canonical-removal failure', () => {
    const flatland = new Flatland()
    flatland.setLighting(new OwnershipLight())
    const sprite = makeSprite()
    flatland.add(sprite)
    const remove = vi.spyOn(flatland, 'remove').mockImplementationOnce(() => {
      throw 0
    })

    let didThrow = false
    let thrown: unknown
    try {
      flatland.clear()
    } catch (error) {
      didThrow = true
      thrown = error
    } finally {
      remove.mockRestore()
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(flatland.spriteGroup.spriteCount).toBe(0)
    expect(trackedMaterials(flatland).size).toBe(0)
    expect(materialRefCounts(flatland).size).toBe(0)
    expect((Reflect.get(flatland, '_pendingChannelValidation') as Set<Sprite2D>).size).toBe(0)
    expect(lightingContext(flatland).materials.size).toBe(0)

    flatland.dispose()
  })
})

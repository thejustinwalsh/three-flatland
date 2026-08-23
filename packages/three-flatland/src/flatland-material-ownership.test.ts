import { describe, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import { vec4 } from 'three/tsl'
import { Flatland } from './Flatland'
import { LightingContext } from './ecs/traits'
import { select, type World } from './ecs/runtime'
import { Light2D } from './lights/Light2D'
import { createLightEffect } from './lights/LightEffect'
import { Sprite2DMaterial } from './materials/Sprite2DMaterial'
import { Sprite2D } from './sprites/Sprite2D'
import { TileMap2D } from './tilemap/TileMap2D'
import type { TileMapData } from './tilemap/types'

const OwnershipLight = createLightEffect({
  name: 'material_ownership_light',
  schema: { ambient: 1 },
  light: () => (context) => vec4(context.color.rgb, context.color.a),
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
    expect(material.globalUniforms).toBe(flatland.globals)

    const next = new Flatland()
    const nextSprite = makeSprite(material)
    expect(() => next.add(nextSprite)).not.toThrow()
    expect(material.globalUniforms).toBe(next.globals)
    next.remove(nextSprite)
    next.dispose()
    flatland.dispose()
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

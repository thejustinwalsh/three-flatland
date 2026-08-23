import { describe, expect, it, vi } from 'vitest'
import { InstancedMesh, Texture, type InstancedBufferAttribute } from 'three'
import { createMaterialEffect } from '../materials/MaterialEffect'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { Flatland } from '../Flatland'
import { attachEffect } from '../react/attach'
import { TileMap2D } from './TileMap2D'
import type { TileMapData } from './types'

function makeMapData(layerCount = 1): TileMapData {
  const texture = new Texture()
  texture.image = { width: 32, height: 32 }
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
    tileLayers: Array.from({ length: layerCount }, (_, index) => ({
      name: `layer-${index}`,
      id: index + 1,
      width: 2,
      height: 2,
      data: new Uint32Array([1, 1, 1, 1]),
    })),
    objectLayers: [],
  }
}

const WideTileEffect = createMaterialEffect({
  name: 'wide_tile_lifecycle',
  schema: {
    first: [1, 2, 3, 4],
    second: [5, 6, 7, 8],
    third: [9, 10, 11, 12],
  },
  node: ({ inputColor }) => inputColor,
})

const TileProvider = createMaterialEffect({
  name: 'tile_provider_lifecycle',
  schema: { source: () => ({ id: 'default' }) },
})

const ThrowingTileEffect = createMaterialEffect({
  name: 'throwing_tile_lifecycle',
  schema: { amount: 1 },
  node: ({ inputColor }) => inputColor,
})

function firstChunk(map: TileMap2D): InstancedMesh {
  return map.getLayers()[0]!.children[0] as InstancedMesh
}

describe('TileMap2D retained material effects', () => {
  it('rebuilds existing chunk geometry when the effect-buffer tier grows', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const previousMaterial = map.getLayerMaterialAt(0)!
    expect(firstChunk(map).geometry.getAttribute('effectBuf2')).toBeUndefined()

    const effect = new WideTileEffect()
    map.addEffect(effect)

    expect(map.getLayerMaterialAt(0)).not.toBe(previousMaterial)
    expect(map.getLayerMaterialAt(0)!.hasEffect(WideTileEffect)).toBe(true)
    const chunk = firstChunk(map)
    const system = chunk.geometry.getAttribute('instanceSystem')
    const effectBuf0 = chunk.geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    const effectBuf2 = chunk.geometry.getAttribute('effectBuf2') as InstancedBufferAttribute
    expect(effectBuf2).toBeDefined()
    expect(system.getW(0)).toBe(1)
    expect(Array.from(effectBuf0.array.slice(0, 4))).toEqual([1, 2, 3, 4])
    expect(Array.from(effectBuf2.array.slice(0, 4))).toEqual([9, 10, 11, 12])
    expect(effect._tileMap).toBe(map)

    map.dispose()
  })

  it('retains effects and rebuilds their packed chunk projection when data changes', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const effect = new WideTileEffect()
    map.addEffect(effect)
    const previousMaterial = map.getLayerMaterialAt(0)!

    map.data = makeMapData()

    expect(map.getLayerMaterialAt(0)).not.toBe(previousMaterial)
    expect(map.getLayerMaterialAt(0)!.hasEffect(WideTileEffect)).toBe(true)
    expect(firstChunk(map).geometry.getAttribute('effectBuf2')).toBeDefined()
    expect(effect._tileMap).toBe(map)

    map.dispose()
  })

  it.each(['data', 'chunkSize'] as const)(
    'rolls back a failed %s projection build without disposing Flatland-owned material state',
    (mode) => {
      const originalData = makeMapData()
      const map = new TileMap2D({ data: originalData })
      const effect = new ThrowingTileEffect()
      map.addEffect(effect)
      const flatland = new Flatland()
      flatland.add(map)
      const previousLayers = [...map.getLayers()]
      const previousMaterial = map.getLayerMaterialAt(0)!
      const dispose = vi.spyOn(previousMaterial, 'dispose')
      const texture = originalData.tilesets[0]!.texture!
      const disposeTexture = vi.spyOn(texture, 'dispose')
      const registerEffect = Sprite2DMaterial.prototype.registerEffect
      const registration = vi.spyOn(Sprite2DMaterial.prototype, 'registerEffect').mockImplementation(function (
        this: Sprite2DMaterial,
        ...args: Parameters<typeof registerEffect>
      ) {
        throw new Error('forced projection registration failure')
      })

      try {
        expect(() => {
          if (mode === 'data') {
            const replacement = makeMapData()
            replacement.tilesets[0]!.texture = texture
            map.data = replacement
          } else map.chunkSize = 1
        }).toThrow('forced projection registration failure')
      } finally {
        registration.mockRestore()
      }

      expect(map.data).toBe(originalData)
      expect(map.chunkSize).toBe(512)
      expect(map.getLayers()).toEqual(previousLayers)
      expect(map.getLayerMaterialAt(0)).toBe(previousMaterial)
      expect(previousMaterial.hasEffect(ThrowingTileEffect)).toBe(true)
      expect(dispose).not.toHaveBeenCalled()
      expect(disposeTexture).not.toHaveBeenCalled()
      expect(Reflect.get(flatland, '_spriteMaterials')).toEqual(new Set([previousMaterial]))
      expect(Reflect.get(flatland, '_spriteMaterialRefCounts')).toEqual(new Map([[previousMaterial, 1]]))

      map.dispose()
      expect(disposeTexture).toHaveBeenCalledTimes(1)
      flatland.dispose()
    }
  )

  it('does not dispose a retained tileset texture during a chunk-size-only rebuild', () => {
    const data = makeMapData()
    const texture = data.tilesets[0]!.texture!
    const dispose = vi.spyOn(texture, 'dispose')
    const map = new TileMap2D({ data })

    map.chunkSize = 1
    expect(dispose).not.toHaveBeenCalled()

    map.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('makes R3F provider unmount/remount replace constants without stale registration', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const sourceA = { id: 'a' }
    const sourceB = { id: 'b' }
    const providerA = new TileProvider()
    const providerB = new TileProvider()
    providerA.source = sourceA
    providerB.source = sourceB

    const cleanupA = attachEffect(map, providerA)
    expect(map.getLayerMaterialAt(0)!._effectConstants.get(TileProvider.effectName)?.source).toBe(sourceA)

    cleanupA()
    attachEffect(map, providerB)

    expect(providerA._tileMap).toBeNull()
    expect(providerB._tileMap).toBe(map)
    expect(map.getLayerMaterialAt(0)!._effectConstants.get(TileProvider.effectName)?.source).toBe(sourceB)

    map.dispose()
  })

  it('rejects one effect instance being owned by two tilemaps without changing either map', () => {
    const first = new TileMap2D({ data: makeMapData() })
    const second = new TileMap2D({ data: makeMapData() })
    const effect = new WideTileEffect()
    first.addEffect(effect)
    const firstMaterial = first.getLayerMaterialAt(0)
    const secondMaterial = second.getLayerMaterialAt(0)

    expect(() => second.addEffect(effect)).toThrow(/already attached to another tilemap/)
    expect(first.getLayerMaterialAt(0)).toBe(firstMaterial)
    expect(firstMaterial!.hasEffect(WideTileEffect)).toBe(true)
    expect(second.getLayerMaterialAt(0)).toBe(secondMaterial)
    expect(secondMaterial!.hasEffect(WideTileEffect)).toBe(false)
    expect(effect._tileMap).toBe(first)

    first.dispose()
    second.dispose()
  })

  it('prepares every layer before publishing an effect registration', () => {
    const map = new TileMap2D({ data: makeMapData(2) })
    const previous = map.getLayers().map((layer) => layer.material)
    const effect = new ThrowingTileEffect()
    const registerEffect = previous[0]!.registerEffect
    let calls = 0
    const registration = vi.spyOn(Sprite2DMaterial.prototype, 'registerEffect').mockImplementation(function (
      this: Sprite2DMaterial,
      ...args: Parameters<typeof registerEffect>
    ) {
      calls++
      if (calls === 2) throw new Error('tile effect builder failed')
      return registerEffect.apply(this, args)
    })

    try {
      expect(() => map.addEffect(effect)).toThrow('tile effect builder failed')
    } finally {
      registration.mockRestore()
    }
    expect(map.getLayers().map((layer) => layer.material)).toEqual(previous)
    expect(previous.every((material) => !material.hasEffect(ThrowingTileEffect))).toBe(true)
    expect(effect._tileMap).toBeNull()

    map.dispose()
  })
})

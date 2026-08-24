import { describe, expect, it, vi } from 'vitest'
import { AdditiveBlending, DoubleSide, Group, InstancedMesh, Texture, type InstancedBufferAttribute } from 'three'
import { createMaterialEffect } from '../materials/MaterialEffect'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { Flatland } from '../Flatland'
import { attachEffect } from '../react/attach'
import { TileMap2D } from './TileMap2D'
import type { TileDefinition, TileMapData } from './types'
import { subscribeTileMapMaterials } from '../internal/ownership-observers'
import { copyTileLayerMaterialState } from '../internal/tile-layer-operations'
import { registerTileLayerOwner } from '../internal/tile-layer-ownership'

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

const DynamicTileEffect = createMaterialEffect({
  name: 'dynamic_tile_values',
  schema: { amount: 1, direction: [2, 3, 4] },
  node: ({ inputColor }) => inputColor,
})

const ReentrantTileEffect = createMaterialEffect({
  name: 'reentrant_tile_values',
  schema: { first: 3, second: 6 },
  node: ({ inputColor }) => inputColor,
})

function firstChunk(map: TileMap2D): InstancedMesh {
  return map.getLayers()[0]!.children[0] as InstancedMesh
}

describe('TileMap2D retained material effects', () => {
  it('uses retained scalar/vector values as the baseline and keeps tile overrides authoritative', () => {
    const data = makeMapData()
    data.tileLayers[0]!.data = new Uint32Array([1, 2, 1, 2])
    data.tilesets[0]!.tiles.set(0, {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      properties: { amount: 40, direction: [50] },
    })
    const map = new TileMap2D({ data })
    const effect = new DynamicTileEffect()
    effect.amount = 7
    effect.direction = [8, 9, 10]
    map.addEffect(effect)

    let buffer = firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    expect(Array.from(buffer.array.slice(0, 8))).toEqual([40, 50, 9, 10, 7, 8, 9, 10])

    effect.amount = 11
    effect.direction = [12, 13, 14]
    buffer = firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    expect(Array.from(buffer.array.slice(0, 8))).toEqual([40, 50, 13, 14, 11, 12, 13, 14])

    map.chunkSize = 1
    buffer = firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    expect(Array.from(buffer.array.slice(0, 4))).toEqual([40, 50, 13, 14])
    const baselineChunk = map.getLayerAt(0)!.children[1] as InstancedMesh
    buffer = baselineChunk.geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    expect(Array.from(buffer.array.slice(0, 4))).toEqual([11, 12, 13, 14])
    map.dispose()
  })

  it('reprojects effect properties and animation state on nonzero tile replacement', () => {
    const data = makeMapData()
    data.tileLayers[0]!.data = new Uint32Array([1, 0, 0, 0])
    data.tilesets[0]!.tiles.set(0, {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      properties: { amount: 4 },
      animation: [{ tileId: 0, duration: 100 }],
    })
    data.tilesets[0]!.tiles.set(1, {
      id: 1,
      uv: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      properties: { amount: 6 },
    })
    const map = new TileMap2D({ data })
    const effect = new DynamicTileEffect()
    map.addEffect(effect)
    const layer = map.getLayerAt(0)!
    expect((Reflect.get(layer, 'animatedTilePositions') as Map<unknown, unknown>).size).toBe(1)

    layer.setTileAt(0, 0, 2)

    const buffer = firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    expect(buffer.array[0]).toBe(6)
    expect((Reflect.get(layer, 'animatedTilePositions') as Map<unknown, unknown>).size).toBe(0)
    map.dispose()
  })

  it('preserves masked flip flags on the nonzero fast path', () => {
    const data = makeMapData()
    data.tileLayers[0]!.data = new Uint32Array([1, 0, 0, 0])
    const map = new TileMap2D({ data })
    const layer = map.getLayerAt(0)!

    layer.setTileAt(0, 0, 0x80000002)

    const system = firstChunk(map).geometry.getAttribute('instanceSystem')
    expect(system.getX(0)).toBe(-1)
    expect(system.getY(0)).toBe(1)
    expect(layer.getTileAt(0, 0)).toBe(2)
    map.dispose()
  })

  it('prepares custom UV accessors before publishing a fast-path tile replacement', () => {
    const data = makeMapData()
    data.tileLayers[0]!.data = new Uint32Array([1, 0, 0, 0])
    const target = { id: 1, properties: {} } as unknown as TileDefinition
    Object.defineProperty(target, 'uv', {
      get() {
        throw 0
      },
    })
    data.tilesets[0]!.tiles.set(1, target)
    const map = new TileMap2D({ data })
    const layer = map.getLayerAt(0)!
    const uv = firstChunk(map).geometry.getAttribute('instanceUV')
    const before = [uv.getX(0), uv.getY(0), uv.getZ(0), uv.getW(0)]

    let didThrow = false
    let thrown: unknown
    try {
      layer.setTileAt(0, 0, 2)
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(data.tileLayers[0]!.data[0]).toBe(1)
    expect(layer.getTileAt(0, 0)).toBe(1)
    expect([uv.getX(0), uv.getY(0), uv.getZ(0), uv.getW(0)]).toEqual(before)
    map.dispose()
  })

  it('does not publish a tile mutation when metadata preparation terminalizes the layer', () => {
    const data = makeMapData()
    data.tileLayers[0]!.data = new Uint32Array([1, 1, 1, 1])
    data.tilesets[0]!.tiles.set(0, {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      properties: {},
    })
    const target: TileDefinition = {
      id: 1,
      uv: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      properties: {},
    }
    data.tilesets[0]!.tiles.set(1, target)
    const map = new TileMap2D({ data })
    const effect = new DynamicTileEffect()
    map.addEffect(effect)
    const layer = map.getLayerAt(0)!
    target.properties = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          layer.dispose()
          return undefined
        },
      }
    )

    expect(() => layer.setTileAt(0, 0, 2)).toThrow(/terminated during preparation/)
    expect(data.tileLayers[0]!.data[0]).toBe(1)
    expect(map.getLayers()).toEqual([])
    expect(layer.children).toEqual([])
    expect(layer.chunkCount).toBe(0)
    map.dispose()
  })

  it('rejects a nested setTileAt before either logical or GPU state changes', () => {
    const data = makeMapData()
    data.tileLayers[0]!.data = new Uint32Array([1, 1, 1, 1])
    data.tilesets[0]!.tiles.set(0, {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      properties: {},
    })
    const target: TileDefinition = {
      id: 1,
      uv: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      properties: {},
    }
    data.tilesets[0]!.tiles.set(1, target)
    const map = new TileMap2D({ data })
    map.addEffect(new DynamicTileEffect())
    const layer = map.getLayerAt(0)!
    const geometry = firstChunk(map).geometry
    const uv = geometry.getAttribute('instanceUV')
    const before = [uv.getX(0), uv.getY(0), uv.getZ(0), uv.getW(0)]
    target.properties = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          layer.setTileAt(1, 0, 0)
          return undefined
        },
      }
    )

    expect(() => layer.setTileAt(0, 0, 2)).toThrow(/projection transition/)
    expect(Array.from(data.tileLayers[0]!.data)).toEqual([1, 1, 1, 1])
    expect(firstChunk(map).geometry).toBe(geometry)
    expect([uv.getX(0), uv.getY(0), uv.getZ(0), uv.getW(0)]).toEqual(before)
    map.dispose()
  })

  it('keeps constants-only providers on the allocation-free nonzero fast path', () => {
    const data = makeMapData()
    data.tileLayers[0]!.data = new Uint32Array([1, 0, 0, 0])
    const map = new TileMap2D({ data })
    map.addEffect(new TileProvider())
    const layer = map.getLayerAt(0)!
    const geometry = firstChunk(map).geometry

    layer.setTileAt(0, 0, 2)

    expect(firstChunk(map).geometry).toBe(geometry)
    expect(layer.getTileAt(0, 0)).toBe(2)
    map.dispose()
  })

  it('preflights every layer and leaves prior rows/defaults untouched on a late target failure', () => {
    const map = new TileMap2D({ data: makeMapData(2) })
    const effect = new DynamicTileEffect()
    map.addEffect(effect)
    const first = map.getLayerAt(0)!
    const second = map.getLayerAt(1)!
    const firstBuffer = firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    const before = Array.from(firstBuffer.array.slice(0, 4))
    const version = firstBuffer.version
    registerTileLayerOwner(second, {
      release: () => ({ didError: false, retainMaterial: false }),
      tileDataChanged: () => {},
    })
    second.dispose()

    expect(() => {
      effect.amount = 9
    }).toThrow(/after dispose/)
    expect(effect.amount).toBe(1)
    expect(Array.from(firstBuffer.array.slice(0, 4))).toEqual(before)
    expect(firstBuffer.version).toBe(version)
    map.dispose()
  })

  it('prepares every hostile tile override before committing any layer row', () => {
    const data = makeMapData(2)
    data.tileLayers[1]!.data.fill(2)
    data.tilesets[0]!.tiles.set(0, {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      properties: { amount: 4 },
    })
    const secondTile: TileDefinition = {
      id: 1,
      uv: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      properties: { amount: 5 },
    }
    data.tilesets[0]!.tiles.set(1, secondTile)
    const map = new TileMap2D({ data })
    const effect = new DynamicTileEffect()
    map.addEffect(effect)
    const firstBuffer = firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    const secondBuffer = (map.getLayerAt(1)!.children[0] as InstancedMesh).geometry.getAttribute(
      'effectBuf0'
    ) as InstancedBufferAttribute
    const firstBefore = Array.from(firstBuffer.array)
    const secondBefore = Array.from(secondBuffer.array)
    const firstVersion = firstBuffer.version
    const secondVersion = secondBuffer.version
    secondTile.properties = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw 0
        },
      }
    )

    let didThrow = false
    let thrown: unknown
    try {
      effect.amount = 9
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(effect.amount).toBe(1)
    expect(Array.from(firstBuffer.array)).toEqual(firstBefore)
    expect(Array.from(secondBuffer.array)).toEqual(secondBefore)
    expect(firstBuffer.version).toBe(firstVersion)
    expect(secondBuffer.version).toBe(secondVersion)
    map.dispose()
  })

  it('does not publish a vector snapshot from a failed projection transaction', () => {
    const data = makeMapData()
    const tile: TileDefinition = {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      properties: {},
    }
    data.tilesets[0]!.tiles.set(0, tile)
    const map = new TileMap2D({ data })
    const effect = new DynamicTileEffect()
    map.addEffect(effect)
    let captured: readonly [number, number, number] | undefined
    tile.properties = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          captured = effect.direction
          throw new Error('forced vector projection failure')
        },
      }
    )

    expect(() => {
      effect.direction = [8, 9, 10]
    }).toThrow('forced vector projection failure')
    expect(captured).toEqual([2, 3, 4])
    expect(Object.isFrozen(captured)).toBe(true)
    expect(effect.direction).toBe(captured)
    expect(effect._defaults.direction).toEqual([2, 3, 4])

    map.dispose()
  })

  it('reuses TileMap vector transaction state and keeps snapshots lazy across steady writes', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const effect = new DynamicTileEffect()
    map.addEffect(effect)
    effect.direction = [3, 4, 5]
    const direction: [number, number, number] = [0, 0, 0]
    const weakMapSet = vi.spyOn(WeakMap.prototype, 'set')
    const freeze = vi.spyOn(Object, 'freeze')
    let setCallsAfterWrites = -1
    let freezeCallsAfterWrites = -1
    let setCallsAfterFirstRead = -1
    let freezeCallsAfterFirstRead = -1
    let setCallsAfterUnchangedRead = -1
    let freezeCallsAfterUnchangedRead = -1
    let setCallsAfterNextWrite = -1
    let freezeCallsAfterNextWrite = -1
    let setCallsAfterNextRead = -1
    let freezeCallsAfterNextRead = -1
    let first: readonly [number, number, number] | undefined
    let unchanged: readonly [number, number, number] | undefined
    let next: readonly [number, number, number] | undefined

    try {
      for (let i = 1; i <= 3_000; i++) {
        direction[0] = i
        direction[1] = i + 1
        direction[2] = i + 2
        effect.direction = direction
      }
      setCallsAfterWrites = weakMapSet.mock.calls.length
      freezeCallsAfterWrites = freeze.mock.calls.length

      first = effect.direction
      setCallsAfterFirstRead = weakMapSet.mock.calls.length
      freezeCallsAfterFirstRead = freeze.mock.calls.length
      unchanged = effect.direction
      setCallsAfterUnchangedRead = weakMapSet.mock.calls.length
      freezeCallsAfterUnchangedRead = freeze.mock.calls.length

      effect.direction = [4_000, 4_001, 4_002]
      setCallsAfterNextWrite = weakMapSet.mock.calls.length
      freezeCallsAfterNextWrite = freeze.mock.calls.length
      next = effect.direction
      setCallsAfterNextRead = weakMapSet.mock.calls.length
      freezeCallsAfterNextRead = freeze.mock.calls.length
    } finally {
      freeze.mockRestore()
      weakMapSet.mockRestore()
      map.dispose()
    }
    expect(setCallsAfterWrites).toBe(0)
    expect(freezeCallsAfterWrites).toBe(0)
    expect(first).toEqual([3_000, 3_001, 3_002])
    expect(setCallsAfterFirstRead).toBe(1)
    expect(freezeCallsAfterFirstRead).toBe(1)
    expect(unchanged).toBe(first)
    expect(setCallsAfterUnchangedRead).toBe(1)
    expect(freezeCallsAfterUnchangedRead).toBe(1)
    expect(setCallsAfterNextWrite).toBe(1)
    expect(freezeCallsAfterNextWrite).toBe(1)
    expect(next).toEqual([4_000, 4_001, 4_002])
    expect(setCallsAfterNextRead).toBe(1)
    expect(freezeCallsAfterNextRead).toBe(2)
  })

  it('rejects a nested effect setter before shared projection scratch can be overwritten', () => {
    const data = makeMapData()
    const tile: TileDefinition = {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      properties: {},
    }
    data.tilesets[0]!.tiles.set(0, tile)
    const map = new TileMap2D({ data })
    const effect = new ReentrantTileEffect()
    map.addEffect(effect)
    const buffer = firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    const before = Array.from(buffer.array)
    const version = buffer.version
    tile.properties = new Proxy(
      {},
      {
        getOwnPropertyDescriptor(target, property) {
          if (property === 'first') effect.second = 8
          return Reflect.getOwnPropertyDescriptor(target, property)
        },
      }
    )

    expect(() => {
      effect.first = 9
    }).toThrow(/projection transition/)
    expect(effect.first).toBe(3)
    expect(effect.second).toBe(6)
    expect(Array.from(buffer.array)).toEqual(before)
    expect(buffer.version).toBe(version)
    expect(Reflect.get(map.getLayerAt(0)!, '_effectSyncBuffers')).toEqual([])
    map.dispose()
  })

  it('clears every snapshotted layer when late-row preparation terminalizes the map', () => {
    const data = makeMapData(2)
    data.tileLayers[1]!.data.fill(2)
    data.tilesets[0]!.tiles.set(0, {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      properties: {},
    })
    const lateTile: TileDefinition = {
      id: 1,
      uv: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      properties: {},
    }
    data.tilesets[0]!.tiles.set(1, lateTile)
    const map = new TileMap2D({ data })
    const effect = new DynamicTileEffect()
    map.addEffect(effect)
    const layers = [...map.getLayers()]
    const buffers = layers.map(
      (layer) => (layer.children[0] as InstancedMesh).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    )
    const values = buffers.map((buffer) => Array.from(buffer.array))
    const versions = buffers.map((buffer) => buffer.version)
    lateTile.properties = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          map.dispose()
          return undefined
        },
      }
    )

    expect(() => {
      effect.amount = 9
    }).toThrow(/terminated during preparation/)
    expect(effect.amount).toBe(1)
    expect(map.getLayers()).toEqual([])
    for (let index = 0; index < layers.length; index++) {
      expect(Array.from(buffers[index]!.array)).toEqual(values[index])
      expect(buffers[index]!.version).toBe(versions[index])
      expect(Reflect.get(layers[index]!, '_effectSyncBuffers')).toEqual([])
      expect(Reflect.get(layers[index]!, '_effectSync0')).toEqual([])
      expect(Reflect.get(layers[index]!, '_effectSyncCount')).toBe(0)
      expect(Reflect.get(layers[index]!, '_effectValueTransition')).toBe(false)
    }
  })

  it('does not scan or dirty chunk buffers for identical scalar/vector assignments', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const effect = new DynamicTileEffect()
    map.addEffect(effect)
    const buffer = firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    const initialVersion = buffer.version

    effect.amount = 1
    effect.direction = [2, 3, 4]
    expect(buffer.version).toBe(initialVersion)
    effect.amount = 7
    const scalarVersion = buffer.version
    effect.amount = 7
    expect(buffer.version).toBe(scalarVersion)
    effect.direction = [8, 9, 10]
    const vectorVersion = buffer.version
    effect.direction = [8, 9, 10]
    expect(buffer.version).toBe(vectorVersion)
    map.dispose()
  })

  it('releases two-phase effect buffer scratch after updates, rebuilds, and disposal', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const effect = new DynamicTileEffect()
    map.addEffect(effect)
    const layer = map.getLayerAt(0)!
    const oldBuffer = (firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute)
      .array as Float32Array

    effect.amount = 7
    expect(Reflect.get(layer, '_effectSyncBuffers')).toEqual([])
    map.chunkSize = 1
    expect(Reflect.get(layer, '_effectSyncBuffers')).not.toContain(oldBuffer)
    effect.direction = [8, 9, 10]
    expect(Reflect.get(layer, '_effectSyncBuffers')).toEqual([])

    layer.dispose()
    expect(Reflect.get(layer, '_effectSyncBuffers')).toEqual([])
    expect(Reflect.get(layer, '_effectSyncOffsets')).toEqual([])
    expect(Reflect.get(layer, '_effectSync0')).toEqual([])
    map.dispose()
  })

  it('uses baseline values for malformed or non-finite tile overrides without invoking accessors', () => {
    const data = makeMapData()
    data.tileLayers[0]!.data = new Uint32Array([1, 0, 0, 0])
    const accessor = vi.fn(() => {
      throw new Error('must not run')
    })
    const properties: Record<string, unknown> = {
      direction: [Symbol('invalid'), Infinity, 'invalid'],
    }
    Object.defineProperty(properties, 'amount', { get: accessor })
    data.tilesets[0]!.tiles.set(1, {
      id: 1,
      uv: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      properties,
    })
    const map = new TileMap2D({ data })
    const effect = new DynamicTileEffect()
    effect.amount = 7
    effect.direction = [8, 9, 10]
    map.addEffect(effect)
    const layer = map.getLayerAt(0)!

    layer.setTileAt(0, 0, 2)

    const buffer = firstChunk(map).geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    expect(Array.from(buffer.array.slice(0, 4))).toEqual([7, 8, 9, 10])
    expect(Array.from(buffer.array.slice(0, 4)).every(Number.isFinite)).toBe(true)
    expect(accessor).not.toHaveBeenCalled()
    expect(layer.getTileAt(0, 0)).toBe(2)
    map.dispose()
  })

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

  it('preserves authored material state by stable layer id across duplicate-name reorder and rename', () => {
    const original = makeMapData(2)
    original.tileLayers[0]!.name = 'duplicate'
    original.tileLayers[1]!.name = 'duplicate'
    const map = new TileMap2D({ data: original })
    const byId = new Map(map.getLayers().map((layer) => [layer.data.id, layer.material]))
    const first = byId.get(1)!
    const second = byId.get(2)!
    first.opacity = 0.25
    first.side = DoubleSide
    first.userData = { owner: 'first' }
    second.opacity = 0.75
    second.blending = AdditiveBlending
    second.colorWrite = false
    second.userData = { owner: 'second' }

    const replacement = makeMapData(2)
    replacement.tilesets[0]!.texture = original.tilesets[0]!.texture
    replacement.tileLayers.reverse()
    replacement.tileLayers[0]!.name = 'renamed'
    replacement.tileLayers[1]!.name = 'duplicate'
    map.data = replacement

    const currentById = new Map(map.getLayers().map((layer) => [layer.data.id, layer.material]))
    expect(currentById.get(1)).not.toBe(first)
    expect(currentById.get(1)).toMatchObject({
      opacity: 0.25,
      side: DoubleSide,
      userData: { owner: 'first' },
    })
    expect(currentById.get(2)).not.toBe(second)
    expect(currentById.get(2)).toMatchObject({
      opacity: 0.75,
      blending: AdditiveBlending,
      colorWrite: false,
      userData: { owner: 'second' },
    })

    map.dispose()
  })

  it('preserves standard material state across effect schema replacement', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const before = map.getLayerMaterialAt(0)!
    before.opacity = 0.4
    before.blending = AdditiveBlending
    before.side = DoubleSide
    before.depthTest = false
    before.colorWrite = false
    before.userData = { authored: { value: 3 } }
    const effect = new WideTileEffect()

    map.addEffect(effect)
    const afterAdd = map.getLayerMaterialAt(0)!
    expect(afterAdd).not.toBe(before)
    expect(afterAdd).toMatchObject({
      opacity: 0.4,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthTest: false,
      colorWrite: false,
      userData: { authored: { value: 3 } },
    })

    map.removeEffect(effect)
    const afterRemove = map.getLayerMaterialAt(0)!
    expect(afterRemove).not.toBe(afterAdd)
    expect(afterRemove).toMatchObject({
      opacity: 0.4,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthTest: false,
      colorWrite: false,
      userData: { authored: { value: 3 } },
    })

    map.dispose()
  })

  it('preserves premultiplied-alpha shader variants across effect schema replacement', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const source = new Sprite2DMaterial({
      map: map.getLayerMaterialAt(0)!.map ?? undefined,
      premultipliedAlpha: true,
    })
    copyTileLayerMaterialState(map.getLayers()[0]!, source)
    expect(map.getLayerMaterialAt(0)!.variantOptions.premultipliedAlpha).toBe(true)

    const effect = new WideTileEffect()
    map.addEffect(effect)
    expect(map.getLayerMaterialAt(0)!.variantOptions.premultipliedAlpha).toBe(true)

    map.removeEffect(effect)
    expect(map.getLayerMaterialAt(0)!.variantOptions.premultipliedAlpha).toBe(true)

    source.dispose()
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

  it('restores every old layer when a falsy removed-listener failure interrupts projection retirement', () => {
    const originalData = makeMapData(2)
    const map = new TileMap2D({ data: originalData })
    const previousLayers = [...map.getLayers()]
    const previousMaterials = previousLayers.map((layer) => layer.material)
    const disposals = previousMaterials.map((material) => vi.spyOn(material, 'dispose'))
    const before = new Group()
    const between = new Group()
    const after = new Group()
    const intruder = new Group()
    const foreignParent = new Group()
    map.remove(...previousLayers)
    map.add(before, previousLayers[0]!, between, previousLayers[1]!, after)
    const previousChildren = [...map.children]
    const throwOnRemoved = (): void => {
      foreignParent.add(previousLayers[0]!)
      map.add(intruder)
      throw 0
    }
    previousLayers[1]!.addEventListener('removed', throwOnRemoved)

    let didThrow = false
    let thrown: unknown
    try {
      map.data = makeMapData(2)
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(map.data).toBe(originalData)
    expect(map.getLayers()).toEqual(previousLayers)
    expect(map.children).toEqual(previousChildren)
    expect(previousLayers.every((layer) => layer.parent === map)).toBe(true)
    expect(foreignParent.children).toEqual([])
    expect(intruder.parent).toBeNull()
    expect(map.getLayers().map((layer) => layer.material)).toEqual(previousMaterials)
    expect(disposals.every((dispose) => dispose.mock.calls.length === 0)).toBe(true)

    previousLayers[1]!.removeEventListener('removed', throwOnRemoved)
    map.dispose()
  })

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

  it('rolls every layer and owner back when material replacement notification throws 0', () => {
    const map = new TileMap2D({ data: makeMapData(2) })
    const previousLayers = [...map.getLayers()]
    const previousMaterials = previousLayers.map((layer) => layer.material)
    const effect = new WideTileEffect()
    const unsubscribe = subscribeTileMapMaterials(map, () => {
      throw 0
    })

    let didThrow = false
    let thrown: unknown
    try {
      map.addEffect(effect)
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(map.getLayers()).toEqual(previousLayers)
    expect(map.getLayers().map((layer) => layer.material)).toEqual(previousMaterials)
    expect(previousMaterials.every((material) => !material.hasEffect(WideTileEffect))).toBe(true)
    expect(effect._tileMap).toBeNull()

    unsubscribe()
    map.dispose()
  })

  it('commits add/remove ownership and Flatland tracking before draining every throwing old material', () => {
    const map = new TileMap2D({ data: makeMapData(2) })
    const flatland = new Flatland()
    flatland.add(map)
    const effect = new WideTileEffect()
    const beforeAdd = map.getLayers().map((layer) => layer.material)
    const addDisposals = beforeAdd.map((material) => vi.spyOn(material, 'dispose'))
    beforeAdd[0]!.addEventListener('dispose', () => {
      throw 0
    })

    let didAddThrow = false
    let addError: unknown
    try {
      map.addEffect(effect)
    } catch (error) {
      didAddThrow = true
      addError = error
    }

    const afterAdd = map.getLayers().map((layer) => layer.material)
    expect(didAddThrow).toBe(true)
    expect(addError).toBe(0)
    expect(afterAdd).not.toEqual(beforeAdd)
    expect(afterAdd.every((material) => material.hasEffect(WideTileEffect))).toBe(true)
    expect(addDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true)
    expect(effect._tileMap).toBe(map)
    expect(Reflect.get(flatland, '_spriteMaterials')).toEqual(new Set(afterAdd))
    expect(Reflect.get(flatland, '_spriteMaterialRefCounts')).toEqual(
      new Map(afterAdd.map((material) => [material, 1]))
    )

    const removeDisposals = afterAdd.map((material) => vi.spyOn(material, 'dispose'))
    afterAdd[0]!.addEventListener('dispose', () => {
      throw false
    })
    let didRemoveThrow = false
    let removeError: unknown
    try {
      map.removeEffect(effect)
    } catch (error) {
      didRemoveThrow = true
      removeError = error
    }

    const afterRemove = map.getLayers().map((layer) => layer.material)
    expect(didRemoveThrow).toBe(true)
    expect(removeError).toBe(false)
    expect(afterRemove.every((material) => !material.hasEffect(WideTileEffect))).toBe(true)
    expect(removeDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true)
    expect(effect._tileMap).toBeNull()
    expect(Reflect.get(flatland, '_spriteMaterials')).toEqual(new Set(afterRemove))
    expect(Reflect.get(flatland, '_spriteMaterialRefCounts')).toEqual(
      new Map(afterRemove.map((material) => [material, 1]))
    )

    flatland.remove(map)
    map.dispose()
    flatland.dispose()
  })

  it('commits coherent add/remove effect chunks before rethrowing exact retirement errors', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const effect = new WideTileEffect()
    const beforeAddChunk = firstChunk(map)
    beforeAddChunk.geometry.addEventListener('dispose', () => {
      throw 0
    })

    let addError: unknown
    try {
      map.addEffect(effect)
    } catch (error) {
      addError = error
    }
    const afterAddChunk = firstChunk(map)
    expect(addError).toBe(0)
    expect(afterAddChunk).not.toBe(beforeAddChunk)
    expect(afterAddChunk.parent).toBe(map.getLayerAt(0))
    expect(afterAddChunk.material).toBe(map.getLayerMaterialAt(0))
    expect(map.totalTileCount).toBe(4)
    expect(effect._tileMap).toBe(map)

    afterAddChunk.geometry.addEventListener('dispose', () => {
      throw false
    })
    let removeError: unknown
    try {
      map.removeEffect(effect)
    } catch (error) {
      removeError = error
    }
    const afterRemoveChunk = firstChunk(map)
    expect(removeError).toBe(false)
    expect(afterRemoveChunk).not.toBe(afterAddChunk)
    expect(afterRemoveChunk.parent).toBe(map.getLayerAt(0))
    expect(afterRemoveChunk.material).toBe(map.getLayerMaterialAt(0))
    expect(map.totalTileCount).toBe(4)
    expect(effect._tileMap).toBeNull()

    map.dispose()
  })

  it('restores tile data on build failure and publishes coherent data before cleanup errors', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const layer = map.getLayerAt(0)!
    const data = layer.data.data
    const schema = vi.spyOn(layer.material, 'getInstanceAttributeSchema').mockImplementationOnce(() => {
      throw new Error('forced chunk preparation failure')
    })

    expect(() => layer.setTileAt(0, 0, 0)).toThrow('forced chunk preparation failure')
    expect(data[0]).toBe(1)
    expect(layer.tileCount).toBe(4)
    expect(layer.children).toHaveLength(1)
    schema.mockRestore()

    const retired = firstChunk(map)
    retired.geometry.addEventListener('dispose', () => {
      throw 0
    })
    let cleanupError: unknown
    try {
      layer.setTileAt(0, 0, 0)
    } catch (error) {
      cleanupError = error
    }
    expect(cleanupError).toBe(0)
    expect(data[0]).toBe(0)
    expect(layer.getTileAt(0, 0)).toBe(0)
    expect(layer.tileCount).toBe(3)
    expect(layer.children).toHaveLength(1)
    expect(firstChunk(map)).not.toBe(retired)

    map.dispose()
  })

  it('preserves authored child slots and rejects listener resurrection during chunk replacement', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const layer = map.getLayerAt(0)!
    const retired = firstChunk(map)
    const before = new Group()
    const after = new Group()
    layer.remove(retired)
    layer.add(before, retired, after)
    retired.addEventListener('removed', () => {
      layer.add(retired)
    })

    layer.setTileAt(0, 0, 0)

    const current = layer.children.find((child): child is InstancedMesh => child instanceof InstancedMesh)!
    expect(layer.children).toEqual([before, current, after])
    expect(retired.parent).toBeNull()
    expect(current).not.toBe(retired)
    map.dispose()
  })

  it('drains every chunk, layer material, and tileset after a geometry dispose listener throws 0', () => {
    const data = makeMapData(2)
    const map = new TileMap2D({ data, chunkSize: 1 })
    const layers = [...map.getLayers()]
    const chunks = layers.flatMap((layer) => [...layer.children] as InstancedMesh[])
    const geometries = chunks.map((chunk) => chunk.geometry)
    const geometryDisposals = geometries.map((geometry) => vi.spyOn(geometry, 'dispose'))
    const materialDisposals = layers.map((layer) => vi.spyOn(layer.material, 'dispose'))
    const textureDisposal = vi.spyOn(data.tilesets[0]!.texture!, 'dispose')
    geometries[0]!.addEventListener('dispose', () => {
      throw 0
    })

    let didThrow = false
    let thrown: unknown
    try {
      map.dispose()
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(geometryDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true)
    expect(materialDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true)
    expect(textureDisposal).toHaveBeenCalledTimes(1)
    expect(layers.every((layer) => layer.children.length === 0)).toBe(true)
    expect(map.children).toEqual([])
    expect(map.getLayers()).toEqual([])
    expect(map.data).toBeNull()
    expect(() => map.dispose()).not.toThrow()
  })

  it('rejects public state mutations after terminal disposal without retaining an effect', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const effect = new WideTileEffect()
    map.dispose()

    const mutations = [
      () => map.addEffect(effect),
      () => map.removeEffect(effect),
      () => {
        map.enableCollision = false
      },
      () => {
        map.pixelPerfect = true
      },
      () => {
        map.lit = false
      },
      () => {
        map.receiveShadows = false
      },
      () => map.markOccluders(['solid']),
      () => map.update(16),
    ]
    for (const mutate of mutations) expect(mutate).toThrow(/after dispose/)

    expect(effect._tileMap).toBeNull()
    expect(map.getLayers()).toEqual([])
    expect(map.data).toBeNull()
  })

  it('makes retained TileLayer mutation terminal after map disposal', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const layer = map.getLayerAt(0)!
    map.dispose()

    const mutations = [
      () => layer.setTileAt(0, 0, 1),
      () => layer.setCastsShadowAt(0, 0, true),
      () => layer.update(16),
      () => {
        layer.lit = false
      },
      () => {
        layer.receiveShadows = false
      },
      () => {
        layer.pixelPerfect = true
      },
    ]
    for (const mutate of mutations) expect(mutate).toThrow(/after dispose/)
    expect(layer.children).toEqual([])
    expect(layer.chunkCount).toBe(0)
    expect(layer.tileCount).toBe(0)
  })

  it('canonically releases a directly disposed layer and keeps map-wide mutations coherent', () => {
    const flatland = new Flatland()
    const map = new TileMap2D({ data: makeMapData(2) })
    const disposed = map.getLayerAt(0)!
    const retained = map.getLayerAt(1)!
    const disposedMaterial = disposed.material
    const disposeMaterial = vi.spyOn(disposedMaterial, 'dispose')
    flatland.add(map)

    disposed.dispose()

    expect(disposeMaterial).toHaveBeenCalledTimes(1)
    expect(map.getLayers()).toEqual([retained])
    expect(map.children).toEqual([retained])
    expect((Reflect.get(flatland, '_spriteMaterials') as Set<Sprite2DMaterial>).has(disposedMaterial)).toBe(false)
    expect(() => {
      map.lit = false
      map.receiveShadows = false
      map.pixelPerfect = true
      map.update(16)
      map.addEffect(new DynamicTileEffect())
    }).not.toThrow()
    expect(retained.material.hasEffect(DynamicTileEffect)).toBe(true)
    map.dispose()
    flatland.dispose()
  })

  it('recomputes collision ownership and preserves an exact undefined release error', () => {
    const data = makeMapData(2)
    data.tilesets[0]!.tiles.set(0, {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      collision: [{ type: 'rect', x: 0, y: 0, width: 16, height: 16 }],
    })
    const map = new TileMap2D({ data })
    const disposed = map.getLayerAt(0)!
    const retained = map.getLayerAt(1)!
    expect(map.getCollisionShapes()).toHaveLength(8)
    disposed.addEventListener('removed', () => {
      throw undefined
    })

    let didThrow = false
    let thrown: unknown = 'not thrown'
    try {
      disposed.dispose()
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBeUndefined()
    expect(map.getLayers()).toEqual([retained])
    expect(map.getCollisionShapes()).toHaveLength(4)
    expect(disposed.children).toEqual([])
    map.dispose()
  })

  it('finishes direct-layer cleanup and ownership release when collision extraction throws', () => {
    const data = makeMapData(2)
    const tile: TileDefinition = {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      collision: [{ type: 'rect', x: 0, y: 0, width: 16, height: 16 }],
    }
    data.tilesets[0]!.tiles.set(0, tile)
    const map = new TileMap2D({ data })
    const flatland = new Flatland()
    flatland.add(map)
    const disposed = map.getLayerAt(0)!
    const retained = map.getLayerAt(1)!
    const disposedMaterial = disposed.material
    const geometry = firstChunk(map).geometry
    const materialDispose = vi.spyOn(disposedMaterial, 'dispose')
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    Object.defineProperty(tile, 'collision', {
      configurable: true,
      get() {
        throw 0
      },
    })

    let didThrow = false
    let thrown: unknown
    try {
      disposed.dispose()
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(disposed.children).toEqual([])
    expect(disposed.chunkCount).toBe(0)
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(map.getLayers()).toEqual([retained])
    expect(Reflect.get(flatland, '_spriteMaterials')).toEqual(new Set([retained.material]))
    map.dispose()
    flatland.dispose()
  })

  it('recomputes collision shapes for fast and rebuilt tile mutations', () => {
    const data = makeMapData()
    data.tilesets[0]!.tiles.set(0, {
      id: 0,
      uv: { x: 0, y: 0, width: 0.5, height: 0.5 },
      collision: [{ type: 'rect', x: 0, y: 0, width: 16, height: 16 }],
    })
    data.tilesets[0]!.tiles.set(1, {
      id: 1,
      uv: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
    })
    const map = new TileMap2D({ data })
    const layer = map.getLayerAt(0)!
    const geometry = firstChunk(map).geometry
    expect(map.getCollisionShapes()).toHaveLength(4)

    layer.setTileAt(0, 0, 2)
    expect(firstChunk(map).geometry).toBe(geometry)
    expect(map.getCollisionShapes()).toHaveLength(3)
    layer.setTileAt(1, 0, 0)
    expect(map.getCollisionShapes()).toHaveLength(2)
    layer.setTileAt(1, 0, 1)
    expect(map.getCollisionShapes()).toHaveLength(3)
    map.dispose()
  })

  it('retains map-level render flags before data and after the final layer is released', () => {
    const map = new TileMap2D()
    map.lit = false
    map.receiveShadows = false
    map.data = makeMapData()
    expect(map.getLayers().every((layer) => !layer.lit && !layer.receiveShadows)).toBe(true)

    map.getLayerAt(0)!.lit = true
    map.getLayerAt(0)!.receiveShadows = true
    map.lit = false
    map.receiveShadows = false
    expect(map.getLayers().every((layer) => !layer.lit && !layer.receiveShadows)).toBe(true)

    map.chunkSize = 1
    expect(map.getLayers().every((layer) => !layer.lit && !layer.receiveShadows)).toBe(true)
    map.getLayerAt(0)!.dispose()
    expect(map.getLayers()).toEqual([])
    expect(map.lit).toBe(false)
    expect(map.receiveShadows).toBe(false)

    map.data = makeMapData()
    expect(map.getLayers().every((layer) => !layer.lit && !layer.receiveShadows)).toBe(true)
    map.dispose()
  })

  it('force-detaches chunks and layers reattached by throwing removed listeners', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const layer = map.getLayerAt(0)!
    const chunk = firstChunk(map)
    chunk.addEventListener('removed', () => {
      layer.add(chunk)
      throw 0
    })
    layer.addEventListener('removed', () => {
      map.add(layer)
      throw false
    })

    let thrown: unknown
    try {
      map.dispose()
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(false)
    expect(chunk.parent).toBeNull()
    expect(layer.parent).toBeNull()
    expect(layer.children).toEqual([])
    expect(map.children).toEqual([])
  })

  it('force-detaches a retired layer reattached during a successful projection rebuild', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const retired = map.getLayerAt(0)!
    retired.addEventListener('removed', () => {
      map.add(retired)
    })

    const replacement = makeMapData()
    replacement.tilesets[0]!.texture = map.data!.tilesets[0]!.texture
    map.data = replacement

    expect(map.getLayerAt(0)).not.toBe(retired)
    expect(retired.parent).toBeNull()
    expect(map.children).toEqual([...map.getLayers()])
    map.dispose()
  })

  it('keeps a layer terminal when chunk retirement reentrantly disposes it', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const layer = map.getLayerAt(0)!
    firstChunk(map).geometry.addEventListener('dispose', () => layer.dispose())

    expect(() => layer.setTileAt(0, 0, 0)).toThrow(/terminated/)
    expect(layer.children).toEqual([])
    expect(layer.chunkCount).toBe(0)
    expect(layer.tileCount).toBe(0)
    expect(() => layer.setTileAt(0, 0, 1)).toThrow(/after dispose/)
    map.dispose()
  })

  it('rejects nested projection mutation from retirement callbacks without corrupting the outer result', () => {
    const map = new TileMap2D({ data: makeMapData() })
    const layer = map.getLayerAt(0)!
    let nestedError: unknown
    firstChunk(map).geometry.addEventListener('dispose', () => {
      try {
        layer.setTileAt(1, 0, 0)
      } catch (error) {
        nestedError = error
      }
    })

    layer.setTileAt(0, 0, 0)

    expect(nestedError).toBeInstanceOf(Error)
    expect((nestedError as Error).message).toMatch(/projection transition/)
    expect(layer.getTileAt(0, 0)).toBe(0)
    expect(layer.getTileAt(1, 0)).toBe(1)
    expect(layer.tileCount).toBe(3)
    map.dispose()
  })

  it('does not republish a map disposed from an old-layer removal callback', () => {
    const map = new TileMap2D({ data: makeMapData() })
    map.getLayerAt(0)!.addEventListener('removed', () => map.dispose())

    expect(() => {
      map.data = makeMapData()
    }).toThrow(/terminated/)

    expect(map.data).toBeNull()
    expect(map.getLayers()).toEqual([])
    expect(map.children).toEqual([])
    expect(() => {
      map.data = makeMapData()
    }).toThrow(/after dispose/)
  })

  it('disposes a prepared effect material once when chunk retirement terminates the map', () => {
    const data = makeMapData()
    const map = new TileMap2D({ data })
    const effect = new WideTileEffect()
    const previous = map.getLayerMaterialAt(0)!
    const previousDispose = vi.spyOn(previous, 'dispose')
    const textureDispose = vi.spyOn(data.tilesets[0]!.texture!, 'dispose')
    let prepared: Sprite2DMaterial | undefined
    let disposeCount = 0
    firstChunk(map).geometry.addEventListener('dispose', () => {
      prepared = map.getLayerMaterialAt(0)!
      prepared.addEventListener('dispose', () => disposeCount++)
      map.dispose()
    })

    expect(() => map.addEffect(effect)).toThrow(/terminated/)

    expect(prepared).toBeDefined()
    expect(disposeCount).toBe(1)
    expect(previousDispose).toHaveBeenCalledTimes(1)
    expect(textureDispose).toHaveBeenCalledTimes(1)
    expect(map.getLayers()).toEqual([])
    expect(effect._tileMap).toBeNull()
  })

  it('retires an old effect material once when its dispose listener terminalizes the map', () => {
    const data = makeMapData()
    const map = new TileMap2D({ data })
    const oldMaterial = map.getLayerMaterialAt(0)!
    const oldDispose = vi.spyOn(oldMaterial, 'dispose')
    const textureDispose = vi.spyOn(data.tilesets[0]!.texture!, 'dispose')
    let prepared: Sprite2DMaterial | undefined
    let preparedDisposeCount = 0
    oldMaterial.addEventListener('dispose', () => {
      prepared = map.getLayerMaterialAt(0)!
      prepared.addEventListener('dispose', () => preparedDisposeCount++)
      map.dispose()
    })

    expect(() => map.addEffect(new WideTileEffect())).toThrow(/terminated/)

    expect(prepared).toBeDefined()
    expect(oldDispose).toHaveBeenCalledTimes(1)
    expect(preparedDisposeCount).toBe(1)
    expect(textureDispose).toHaveBeenCalledTimes(1)
    expect(map.getLayers()).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { Raycaster, Texture, type InstancedMesh } from 'three'
import { TileMap2D } from './TileMap2D'
import type { TileMapData } from './types'
import { PIXEL_PERFECT_MASK } from '../materials/effectFlagBits'

function makeRaycaster(x: number, y: number, z = 10): Raycaster {
  const r = new Raycaster()
  r.ray.origin.set(x, y, z)
  r.ray.direction.set(0, 0, -1)
  r.near = 0
  r.far = 100
  return r
}

function makeMapData(): TileMapData {
  const texture = new Texture()
  // @ts-expect-error - mocking image for tests
  texture.image = { width: 64, height: 64 }
  return {
    width: 4,
    height: 4,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    infinite: false,
    tilesets: [
      {
        name: 't',
        firstGid: 1,
        tileWidth: 16,
        tileHeight: 16,
        imageWidth: 64,
        imageHeight: 64,
        columns: 4,
        tileCount: 16,
        tiles: new Map(),
        texture,
      },
    ],
    tileLayers: [
      {
        name: 'ground',
        id: 1,
        width: 4,
        height: 4,
        // Tiled rows top-first: solid ring of 1s with an empty 2×2 center
        data: new Uint32Array([1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1]),
      },
    ],
    objectLayers: [],
  }
}

function makeAnimatedMapData(): TileMapData {
  const data = makeMapData()
  data.tilesets[0]!.tiles.set(0, {
    id: 0,
    uv: { x: 0, y: 0, width: 0.25, height: 0.25 },
    animation: [
      { tileId: 0, duration: 1 },
      { tileId: 1, duration: 1 },
    ],
  })
  return data
}

describe('TileMap2D.raycast', () => {
  function makeMap(): TileMap2D {
    const map = new TileMap2D()
    map.data = makeMapData()
    map.updateMatrixWorld(true)
    return map
  }

  it('hits a solid tile and reports layer + world point', () => {
    const map = makeMap()
    const hits = makeRaycaster(8, 8).intersectObject(map, true)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.object).toBe(map)
    expect(hits[0]!.faceIndex).toBe(0)
    expect(hits[0]!.point.x).toBeCloseTo(8)
  })

  it('misses empty tiles (gid 0)', () => {
    const map = makeMap()
    expect(makeRaycaster(32, 32).intersectObject(map, true)).toHaveLength(0)
  })

  it('misses outside the map bounds', () => {
    const map = makeMap()
    expect(makeRaycaster(100, 100).intersectObject(map, true)).toHaveLength(0)
  })

  it('blocks traversal into TileLayer children (spec §11.1 phantom-hit regression)', () => {
    const map = makeMap()
    const hits = makeRaycaster(32, 32).intersectObject(map, true)
    expect(hits).toHaveLength(0)
    const solid = makeRaycaster(8, 8).intersectObject(map, true)
    expect(solid).toHaveLength(1)
    expect(solid[0]!.object).toBe(map)
  })

  it('tileFromIntersection resolves layer/tile coords/gid', () => {
    const map = makeMap()
    const [hit] = makeRaycaster(8, 8).intersectObject(map, true)
    const tile = map.tileFromIntersection(hit!)
    expect(tile).toEqual({ layer: 0, tileX: 0, tileY: 3, gid: 1 })
  })
})

describe('TileMap2D pixelPerfect', () => {
  it('propagates constructor and runtime values to every layer and tile', () => {
    const map = new TileMap2D({ data: makeMapData(), pixelPerfect: true })
    const layer = map.getLayers()[0]!
    const mesh = layer.children[0]! as InstancedMesh
    const system = mesh.geometry.getAttribute('instanceSystem')

    expect(map.pixelPerfect).toBe(true)
    expect(layer.pixelPerfect).toBe(true)
    expect(Number(system.getZ(0)) & PIXEL_PERFECT_MASK).toBe(PIXEL_PERFECT_MASK)

    map.pixelPerfect = false
    expect(layer.pixelPerfect).toBe(false)
    expect(Number(system.getZ(0)) & PIXEL_PERFECT_MASK).toBe(0)
  })
})

describe('TileLayer animation updates', () => {
  type AnimationProjectionView = {
    size: number
    _elapsed: Float64Array
    _frameIndices: Uint32Array
    _positionAnimationIds: Uint32Array
    _changedAnimations: Uint8Array
    _dirtyChunks: Uint8Array
  }

  function projection(layer: object): AnimationProjectionView {
    return Reflect.get(layer, '_tileAnimations') as AnimationProjectionView
  }

  it('reuses exact typed-array projection storage while advancing animated tiles', () => {
    const map = new TileMap2D({ data: makeAnimatedMapData() })
    const layer = map.getLayers()[0]!
    const state = projection(layer)
    const positions = state._positionAnimationIds
    const changed = state._changedAnimations
    const dirty = state._dirtyChunks

    layer.update(1)
    layer.update(1)

    expect(projection(layer)).toBe(state)
    expect(state._positionAnimationIds).toBe(positions)
    expect(state._changedAnimations).toBe(changed)
    expect(state._dirtyChunks).toBe(dirty)
    expect(state.size).toBe(12)
    expect(changed[0]).toBe(1)
    expect(dirty[0]).toBe(1)

    map.dispose()
    expect(state.size).toBe(0)
    expect(state._positionAnimationIds).toHaveLength(0)
  })

  it('catches up across variable-duration frames after a large delta', () => {
    const data = makeAnimatedMapData()
    data.tilesets[0]!.tiles.get(0)!.animation = [
      { tileId: 0, duration: 10 },
      { tileId: 1, duration: 20 },
      { tileId: 2, duration: 30 },
    ]
    const map = new TileMap2D({ data })
    const layer = map.getLayers()[0]!
    const state = projection(layer)
    const mesh = layer.children[0]! as InstancedMesh
    const uv = mesh.geometry.getAttribute('instanceUV')

    layer.update(35)

    expect(state._frameIndices[0]).toBe(2)
    expect(state._elapsed[0]).toBe(5)
    expect(uv.getX(0)).toBeCloseTo(0.5)
    expect(uv.getX(11)).toBeCloseTo(0.5)

    // A complete 60 ms cycle returns to the same frame and preserves its
    // within-frame offset without publishing a redundant UV change.
    layer.update(60)
    expect(state._frameIndices[0]).toBe(2)
    expect(state._elapsed[0]).toBe(5)
    expect(state._changedAnimations[0]).toBe(0)

    map.dispose()
  })

  it('rejects non-finite deltas without mutating the animation clocks', () => {
    const map = new TileMap2D({ data: makeAnimatedMapData() })
    const layer = map.getLayers()[0]!
    const state = projection(layer)

    expect(() => layer.update(Number.POSITIVE_INFINITY)).toThrow('TileLayer.update deltaMs must be finite')
    expect(state._elapsed[0]).toBe(0)
    expect(state._frameIndices[0]).toBe(0)

    map.dispose()
  })
})

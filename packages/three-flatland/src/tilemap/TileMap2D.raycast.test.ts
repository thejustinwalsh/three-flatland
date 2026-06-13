import { describe, it, expect } from 'vitest'
import { Raycaster, Texture } from 'three'
import { TileMap2D } from './TileMap2D'
import type { TileMapData } from './types'

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

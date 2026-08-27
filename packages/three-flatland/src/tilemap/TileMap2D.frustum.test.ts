import { Frustum, Matrix4, OrthographicCamera, Texture, type InstancedMesh } from 'three'
import { describe, expect, it } from 'vitest'
import { TileMap2D } from './TileMap2D'
import type { TileMapData } from './types'

function makeSparseChunkMapData(): TileMapData {
  const texture = new Texture()
  texture.image = { width: 16, height: 16 }
  return {
    width: 5,
    height: 1,
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
        imageWidth: 16,
        imageHeight: 16,
        columns: 1,
        tileCount: 1,
        tiles: new Map(),
        texture,
      },
    ],
    tileLayers: [
      {
        name: 'ground',
        id: 1,
        width: 5,
        height: 1,
        data: new Uint32Array([1, 0, 0, 0, 1]),
      },
    ],
    objectLayers: [],
  }
}

function cameraFrustum(camera: OrthographicCamera): Frustum {
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  )
}

describe('TileMap2D chunk frustum culling', () => {
  it('publishes finite chunk bounds that reject offscreen tile regions', () => {
    const map = new TileMap2D({ data: makeSparseChunkMapData(), chunkSize: 2 })
    map.updateMatrixWorld(true)
    const [nearChunk, farChunk] = map.getLayerAt(0)!.children as InstancedMesh[]
    const camera = new OrthographicCamera(-4, 20, 20, -4, -10, 10)

    expect(nearChunk!.frustumCulled).toBe(true)
    expect(farChunk!.frustumCulled).toBe(true)
    expect(Number.isFinite(nearChunk!.boundingSphere!.radius)).toBe(true)
    expect(Number.isFinite(farChunk!.boundingSphere!.radius)).toBe(true)

    let frustum = cameraFrustum(camera)
    expect(frustum.intersectsObject(nearChunk!)).toBe(true)
    expect(frustum.intersectsObject(farChunk!)).toBe(false)

    camera.position.x = 64
    frustum = cameraFrustum(camera)
    expect(frustum.intersectsObject(nearChunk!)).toBe(false)
    expect(frustum.intersectsObject(farChunk!)).toBe(true)

    map.dispose()
  })
})

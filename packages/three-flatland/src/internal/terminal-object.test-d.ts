import { describe, it } from 'vitest'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { TileMap2D } from '../tilemap/TileMap2D'

describe('terminal object declaration boundary', () => {
  it('does not publish private disposal predicates on public classes', () => {
    type AssertFalse<T extends false> = T
    type TileLayer = import('../tilemap/TileLayer').TileLayer
    const checks: [
      AssertFalse<'_isDisposed' extends keyof Sprite2D ? true : false>,
      AssertFalse<'_isDisposed' extends keyof TileMap2D ? true : false>,
      AssertFalse<'_subscribeMaterialChanges' extends keyof Sprite2D ? true : false>,
      AssertFalse<'_subscribeLayerMaterials' extends keyof TileMap2D ? true : false>,
      AssertFalse<'_replaceMaterial' extends keyof TileLayer ? true : false>,
      AssertFalse<'_copyMaterialState' extends keyof TileLayer ? true : false>,
    ] = [false, false, false, false, false, false]
    void checks
  })
})

import { describe, expectTypeOf, it } from 'vitest'
import type { ThreeElements } from '@react-three/fiber'
import type { Flatland } from '../Flatland'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { Registry } from '../orchestration/registry'
import type { PassEffect } from '../pipeline/PassEffect'
import type { SpriteGroup } from '../pipeline/SpriteGroup'
import type { BatchQueryView } from '../pipeline/batchQuery'
import type { LightEffect } from '../lights/LightEffect'
import type { Sprite2D } from '../sprites/Sprite2D'
import '../react/types'

type AssertFalse<T extends false> = T

describe('private ECS public API boundary', () => {
  it('keeps runtime ownership off consumer-callable objects', () => {
    expectTypeOf<
      [
        AssertFalse<'world' extends keyof Flatland ? true : false>,
        AssertFalse<'world' extends keyof SpriteGroup ? true : false>,
        AssertFalse<'world' extends keyof Registry ? true : false>,
        AssertFalse<'entity' extends keyof Sprite2D ? true : false>,
        AssertFalse<'_autoRegistry' extends keyof Sprite2D ? true : false>,
        AssertFalse<'_trait' extends keyof MaterialEffect ? true : false>,
        AssertFalse<'_trait' extends keyof PassEffect ? true : false>,
        AssertFalse<'_trait' extends keyof LightEffect ? true : false>,
        AssertFalse<'_trait' extends keyof typeof MaterialEffect ? true : false>,
        AssertFalse<'_trait' extends keyof typeof PassEffect ? true : false>,
        AssertFalse<'_trait' extends keyof typeof LightEffect ? true : false>,
      ]
    >().toEqualTypeOf<[false, false, false, false, false, false, false, false, false, false, false]>()
  })

  it('keeps batch construction and TileLayer ownership internal', () => {
    type BatchQueryModule = typeof import('../pipeline/batchQuery')
    expectTypeOf<
      [
        AssertFalse<'buildBatchQueryView' extends keyof BatchQueryModule ? true : false>,
        AssertFalse<'tileLayer' extends keyof ThreeElements ? true : false>,
      ]
    >().toEqualTypeOf<[false, false]>()
    expectTypeOf<BatchQueryView>().toMatchTypeOf<ReadonlyMap<string, unknown>>()
  })
})

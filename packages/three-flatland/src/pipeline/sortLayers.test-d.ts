import { describe, it, expectTypeOf } from 'vitest'
import { Sprite2D } from '../sprites/Sprite2D'
import type { SortLayerValue } from './sortLayers'

// Simulate a user augmentation — module augmentation targets the package
// entry in user code; inside the package the interface merges directly.
declare module './sortLayers' {
  interface SortLayerRegistry {
    radarBlip: import('./sortLayers').SortLayerConfig
  }
}

describe('SortLayerRegistry typed augmentation', () => {
  it('accepts built-in names, augmented names, and numbers', () => {
    const sprite = new Sprite2D()
    expectTypeOf(sprite.sortLayer).toEqualTypeOf<SortLayerValue>()

    sprite.sortLayer = 'entities'
    sprite.sortLayer = 'ui'
    sprite.sortLayer = 'radarBlip'
    sprite.sortLayer = 42

    // @ts-expect-error — unregistered name is a type error
    sprite.sortLayer = 'not-a-layer'
  })

  it('constructor option is equally typed', () => {
    void new Sprite2D({ sortLayer: 'effects' })
    void new Sprite2D({ sortLayer: 3 })
    // @ts-expect-error — typo'd name rejected at the constructor too
    void new Sprite2D({ sortLayer: 'effects2' })
  })
})

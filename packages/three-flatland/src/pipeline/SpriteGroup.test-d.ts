import { describe, expectTypeOf, it } from 'vitest'
import { SpriteGroup } from './SpriteGroup'
import type { SpriteGroupOptions } from './types'

describe('SpriteGroup capacity hint declaration boundary', () => {
  it('accepts expectedSprites only through constructor options', () => {
    expectTypeOf<ConstructorParameters<typeof SpriteGroup>[0]>().toEqualTypeOf<SpriteGroupOptions | undefined>()

    const group = new SpriteGroup({ expectedSprites: 1024 })
    // @ts-expect-error expectedSprites is a constructor-only hint, not a mutable property
    void group.expectedSprites
  })
})

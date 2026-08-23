import { describe, expectTypeOf, it } from 'vitest'
import type { ThreeElements } from '@react-three/fiber'
import { Flatland, type FlatlandOptions } from '../Flatland'
import '../react/types'
import { SpriteGroup } from './SpriteGroup'
import type { SpriteGroupOptions } from './types'

describe('SpriteGroup capacity hint declaration boundary', () => {
  it('accepts expectedSprites only through constructor options', () => {
    expectTypeOf<ConstructorParameters<typeof SpriteGroup>[0]>().toEqualTypeOf<SpriteGroupOptions | undefined>()

    const group = new SpriteGroup({ expectedSprites: 1024 })
    // @ts-expect-error expectedSprites is a constructor-only hint, not a mutable property
    void group.expectedSprites
  })

  it('uses stable constructor args in React Three Fiber instead of a mutable prop', () => {
    const spriteOptions: SpriteGroupOptions = { expectedSprites: 1024 }
    const flatlandOptions: FlatlandOptions = { expectedSprites: 1024 }
    const spriteProps: ThreeElements['spriteGroup'] = { args: [spriteOptions] }
    const flatlandProps: ThreeElements['flatland'] = { args: [flatlandOptions] }

    void spriteProps
    void flatlandProps
    expectTypeOf(new Flatland(flatlandOptions)).toEqualTypeOf<Flatland>()

    // @ts-expect-error expectedSprites requires args and reconstruction
    const invalidSpriteProps: ThreeElements['spriteGroup'] = { expectedSprites: 1024 }
    // @ts-expect-error expectedSprites requires args and reconstruction
    const invalidFlatlandProps: ThreeElements['flatland'] = { expectedSprites: 1024 }
    void invalidSpriteProps
    void invalidFlatlandProps
  })
})

import { expectTypeOf } from 'vitest'
import { createMaterialEffect } from './MaterialEffect'

const VectorEffect = createMaterialEffect({
  name: 'readonly_vector_type',
  schema: { vector: [0, 0] as const },
  node: ({ inputColor }) => inputColor,
})
const effect = new VectorEffect()

expectTypeOf(effect.vector).toEqualTypeOf<readonly [number, number]>()
// @ts-expect-error Effect tuples are setter values, not mutable projection storage.
effect.vector.push(1)

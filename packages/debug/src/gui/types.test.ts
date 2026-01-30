import { describe, it, expectTypeOf } from 'vitest'
import type { InferState, ValueKeys, ButtonKeys } from './types.js'

describe('ValueKeys', () => {
  type Schema = {
    mapSize: { value: 256; options: { Small: 128; Medium: 256; Large: 512 } }
    seed: { value: 42; min: 0; max: 999999 }
    showGround: true
    regenerate: { type: 'button' }
  }

  it('should include non-button keys', () => {
    expectTypeOf<ValueKeys<Schema>>().toEqualTypeOf<'mapSize' | 'seed' | 'showGround'>()
  })

  it('should exclude button keys', () => {
    expectTypeOf<'regenerate' extends ValueKeys<Schema> ? true : false>().toEqualTypeOf<false>()
  })
})

describe('ButtonKeys', () => {
  type Schema = {
    mapSize: { value: 256; options: { Small: 128; Medium: 256 } }
    showGround: true
    regenerate: { type: 'button' }
    reset: { type: 'button'; label: 'Reset All' }
  }

  it('should include only button keys', () => {
    expectTypeOf<ButtonKeys<Schema>>().toEqualTypeOf<'regenerate' | 'reset'>()
  })

  it('should exclude value keys', () => {
    expectTypeOf<'mapSize' extends ButtonKeys<Schema> ? true : false>().toEqualTypeOf<false>()
  })
})

describe('InferState', () => {
  type Schema = {
    // SelectControl with Record options
    mapSize: { value: 256; options: { Small: 128; Medium: 256; Large: 512; Mega: 1024 } }
    // SelectControl with array options
    chunkSize: { value: 256; options: readonly [256, 512, 1024, 2048] }
    // SelectControl with string options
    density: {
      value: 'normal'
      options: { Sparse: 'sparse'; Normal: 'normal'; Dense: 'dense'; Packed: 'packed' }
    }
    // NumberControl with min/max
    seed: { value: 42; min: 0; max: 999999; step: 1 }
    // Bare boolean
    showGround: true
    showWalls: false
    // Bare number
    count: 10
    // Bare string
    name: 'test'
    // ColorControl
    tint: { value: '#ff0000'; type: 'color' }
    // NumberControl without range
    speed: { value: 5 }
    // Button (should be excluded)
    regenerate: { type: 'button' }
  }

  type State = InferState<Schema>

  it('should infer union of Record option values for SelectControl', () => {
    expectTypeOf<State['mapSize']>().toEqualTypeOf<128 | 256 | 512 | 1024>()
  })

  it('should infer union of array option values for SelectControl', () => {
    expectTypeOf<State['chunkSize']>().toEqualTypeOf<256 | 512 | 1024 | 2048>()
  })

  it('should infer union of string option values for SelectControl', () => {
    expectTypeOf<State['density']>().toEqualTypeOf<'sparse' | 'normal' | 'dense' | 'packed'>()
  })

  it('should widen NumberControl with range to number', () => {
    expectTypeOf<State['seed']>().toEqualTypeOf<number>()
  })

  it('should widen bare boolean to boolean', () => {
    expectTypeOf<State['showGround']>().toEqualTypeOf<boolean>()
    expectTypeOf<State['showWalls']>().toEqualTypeOf<boolean>()
  })

  it('should widen bare number to number', () => {
    expectTypeOf<State['count']>().toEqualTypeOf<number>()
  })

  it('should widen bare string to string', () => {
    expectTypeOf<State['name']>().toEqualTypeOf<string>()
  })

  it('should widen ColorControl to string', () => {
    expectTypeOf<State['tint']>().toEqualTypeOf<string>()
  })

  it('should widen NumberControl without range to number', () => {
    expectTypeOf<State['speed']>().toEqualTypeOf<number>()
  })

  it('should exclude button keys from state', () => {
    expectTypeOf<'regenerate' extends keyof State ? true : false>().toEqualTypeOf<false>()
  })
})

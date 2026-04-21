import { describe, it, expect } from 'vitest'
import { Texture, Vector2 } from 'three'
import { uniform, vec2 } from 'three/tsl'
import { shadowSDF2D } from './shadows'

describe('shadowSDF2D', () => {
  it('builds a callable node graph that returns a float node', () => {
    const surface = vec2(0, 0)
    const light = vec2(10, 10)
    const worldSize = uniform(new Vector2(100, 100))
    const worldOffset = uniform(new Vector2(0, 0))
    const sdf = new Texture()

    const result = shadowSDF2D(surface, light, sdf, worldSize, worldOffset)
    expect(result).toBeDefined()
    // Node instances expose `.toVar()` — smoke check it's a node-shaped value.
    expect(typeof (result as unknown as { toVar?: unknown }).toVar).toBe('function')
  })

  it('accepts an options bag with compile-time step count', () => {
    const surface = vec2(0, 0)
    const light = vec2(5, 5)
    const worldSize = uniform(new Vector2(100, 100))
    const worldOffset = uniform(new Vector2(0, 0))
    const sdf = new Texture()

    const result = shadowSDF2D(surface, light, sdf, worldSize, worldOffset, {
      steps: 16,
      softness: 8,
      eps: 0.1,
    })
    expect(result).toBeDefined()
  })

  it('accepts uniform nodes for softness / eps', () => {
    const surface = vec2(0, 0)
    const light = vec2(5, 5)
    const worldSize = uniform(new Vector2(100, 100))
    const worldOffset = uniform(new Vector2(0, 0))
    const sdf = new Texture()

    const softnessUniform = uniform(16)
    const result = shadowSDF2D(surface, light, sdf, worldSize, worldOffset, {
      softness: softnessUniform,
    })
    expect(result).toBeDefined()
  })
})

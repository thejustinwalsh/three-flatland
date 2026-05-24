import { describe, it, expect } from 'vitest'
import { Texture, Vector2 } from 'three'
import { float, uniform, vec2 } from 'three/tsl'
import { shadow2D, shadowDrop, shadowDropSoft, shadowSDF2D, shadowSoft2D } from './shadows'

// Node instances expose `.toVar()` — used as a smoke check for a
// node-shaped return value across every builder below.
function isNodeShaped(value: unknown): boolean {
  return typeof (value as { toVar?: unknown }).toVar === 'function'
}

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

describe('shadowDrop', () => {
  it('builds a node-shaped vec4 from raw param inputs', () => {
    const tex = new Texture()
    const uv = vec2(0.5, 0.5)

    const result = shadowDrop(tex, uv, [0.03, -0.03], [0, 0, 0], 0.4)
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })

  it('uses default offset / color / alpha when omitted', () => {
    const tex = new Texture()
    const uv = vec2(0.5, 0.5)

    const result = shadowDrop(tex, uv)
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })

  it('accepts TSL-node inputs for offset / color / alpha', () => {
    const tex = new Texture()
    const uv = vec2(0.5, 0.5)

    const result = shadowDrop(tex, uv, vec2(0.02, -0.02), vec2(0, 0, 0), float(0.5))
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })
})

describe('shadowDropSoft', () => {
  it('builds a node-shaped vec4 from raw param inputs', () => {
    const tex = new Texture()
    const uv = vec2(0.5, 0.5)

    const result = shadowDropSoft(tex, uv, [0.02, -0.02], [0, 0, 0], 0.5, 0.01, 4)
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })

  it('uses defaults when optional params are omitted', () => {
    const tex = new Texture()
    const uv = vec2(0.5, 0.5)

    const result = shadowDropSoft(tex, uv)
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })

  it('accepts TSL-node inputs for offset / color / alpha / softness', () => {
    const tex = new Texture()
    const uv = vec2(0.5, 0.5)

    const result = shadowDropSoft(
      tex,
      uv,
      vec2(0.02, -0.02),
      vec2(0, 0, 0),
      float(0.5),
      uniform(0.01),
      6
    )
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })
})

describe('shadow2D', () => {
  it('builds a node-shaped float from raw param inputs', () => {
    const tex = new Texture()

    const result = shadow2D([0, 0], [10, 10], tex, [512, 512], 0.7)
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })

  it('accepts a TSL-node position and uniform strength', () => {
    const tex = new Texture()

    const result = shadow2D(vec2(0, 0), [10, 10], tex, [512, 512], uniform(0.6))
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })

  it('uses default shadow strength when omitted', () => {
    const tex = new Texture()

    const result = shadow2D([0, 0], [10, 10], tex, [512, 512])
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })
})

describe('shadowSoft2D', () => {
  it('builds a node-shaped float from raw param inputs', () => {
    const tex = new Texture()

    const result = shadowSoft2D([0, 0], [10, 10], tex, [512, 512], 10, 0.7)
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })

  it('accepts a TSL-node position and uniform radius / strength', () => {
    const tex = new Texture()

    const result = shadowSoft2D(vec2(0, 0), [10, 10], tex, [512, 512], uniform(12), float(0.6))
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })

  it('uses default radius / strength when omitted', () => {
    const tex = new Texture()

    const result = shadowSoft2D([0, 0], [10, 10], tex, [512, 512])
    expect(result).toBeDefined()
    expect(isNodeShaped(result)).toBe(true)
  })
})

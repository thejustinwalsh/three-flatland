import { describe, it, expect } from 'vitest'
import { createSynthQuadGeometry, SYNTH_QUAD_INDEX } from './synthQuadGeometry'

// Corner mapping locked here matches synthQuadNodes() exactly: for
// vertexIndex i in 0..3, u = i % 2, v = floor(i / 2),
// position = (u - 0.5, v - 0.5, 0), uv = (u, v). If this geometry's
// position/uv attributes ever drift from the shader's synthesized
// values, user TSL code calling three's uv()/positionGeometry() breaks
// silently again (the #141 regression).
const EXPECTED_POSITIONS = [
  -0.5, -0.5, 0,
  0.5, -0.5, 0,
  -0.5, 0.5, 0,
  0.5, 0.5, 0,
]

const EXPECTED_UVS = [
  0, 0,
  1, 0,
  0, 1,
  1, 1,
]

describe('createSynthQuadGeometry', () => {
  it('sets the index to the CCW synth-quad winding', () => {
    const geometry = createSynthQuadGeometry()
    expect(Array.from(geometry.getIndex()!.array)).toEqual(SYNTH_QUAD_INDEX)
  })

  it('carries a position attribute matching the shader-synthesized corners', () => {
    const geometry = createSynthQuadGeometry()
    const position = geometry.getAttribute('position')
    expect(position).toBeDefined()
    expect(position.itemSize).toBe(3)
    expect(Array.from(position.array)).toEqual(EXPECTED_POSITIONS)
  })

  it('carries a uv attribute matching the shader-synthesized corner UVs', () => {
    const geometry = createSynthQuadGeometry()
    const uv = geometry.getAttribute('uv')
    expect(uv).toBeDefined()
    expect(uv.itemSize).toBe(2)
    expect(Array.from(uv.array)).toEqual(EXPECTED_UVS)
  })

  it('exposes both attributes so user TSL uv()/positionGeometry() reads resolve', () => {
    const geometry = createSynthQuadGeometry()
    expect(geometry.hasAttribute('position')).toBe(true)
    expect(geometry.hasAttribute('uv')).toBe(true)
  })

  it('reuses independent attribute objects per geometry (no cross-geometry GPU-buffer coupling on dispose)', () => {
    const a = createSynthQuadGeometry()
    const b = createSynthQuadGeometry()
    expect(a.getAttribute('position')).not.toBe(b.getAttribute('position'))
    expect(a.getAttribute('uv')).not.toBe(b.getAttribute('uv'))
    // ...but they may share the same backing array — that's just memory reuse.
    expect(a.getAttribute('position').array).toBe(b.getAttribute('position').array)
    expect(a.getAttribute('uv').array).toBe(b.getAttribute('uv').array)
  })
})

import { describe, expect, it } from 'vitest'
import {
  refComputePanelFragment,
  refDilatedScale,
  refPanelUvToDilatedUv,
  refRemapUv,
} from './reference.js'
import type { PanelFragmentInput } from './reference.js'

const NO_RADIUS = [0, 0, 0, 0] as const

/** Sample the fragment at a PANEL-space uv (0..1 across the true rect). */
function sampleAtPanelUv(
  u: number,
  v: number,
  input: Omit<PanelFragmentInput, 'uv'>
): ReturnType<typeof refComputePanelFragment> {
  return refComputePanelFragment({
    ...input,
    uv: refPanelUvToDilatedUv(u, v, input.dimensions[0], input.dimensions[1]),
  })
}

describe('pixel dilation and uv remap', () => {
  it('grows the quad by exactly one panel pixel per side', () => {
    const [sx, sy] = refDilatedScale(200, 100)
    expect(sx * 200).toBeCloseTo(202, 10)
    expect(sy * 100).toBeCloseTo(102, 10)
  })

  it('maps the dilated quad corners one pixel outside the panel rect', () => {
    const [u0, v0] = refRemapUv(0, 0, 200, 100)
    const [u1, v1] = refRemapUv(1, 1, 200, 100)
    expect(u0 * 200).toBeCloseTo(-1, 10)
    expect(v0 * 100).toBeCloseTo(-1, 10)
    expect(u1 * 200).toBeCloseTo(201, 10)
    expect(v1 * 100).toBeCloseTo(101, 10)
  })

  it('keeps the panel rect anchored: panel uv 0..1 round-trips through the dilated quad', () => {
    const [du, dv] = refPanelUvToDilatedUv(0, 1, 200, 100)
    const [u, v] = refRemapUv(du, dv, 200, 100)
    expect(u).toBeCloseTo(0, 10)
    expect(v).toBeCloseTo(1, 10)
  })

  it('gives the fully-rounded cardinal tangent AA headroom inside the dilated quad', () => {
    // fully-rounded panel (radius = 0.49 · height, the packed-encoding max):
    // the isosurface at the top-center tangent sits 0.01 · h from the quad
    // edge — less than the AA half-width. The half-pixel dilation must supply
    // fragments beyond the panel edge so the outer fringe can fade to zero.
    const dims = [22, 22] as const
    const input = {
      dimensions: dims,
      borderSizes: [0, 0, 0, 0] as const,
      borderRadius: [0.49, 0.49, 0.49, 0.49] as const,
    }
    // 0.4 px above the panel's top edge — previously unreachable (no fragments)
    const vOutside = 1 + 0.4 / dims[1]
    const [du, dv] = refPanelUvToDilatedUv(0.5, vOutside, dims[0], dims[1])
    expect(du).toBeGreaterThanOrEqual(0)
    expect(dv).toBeLessThanOrEqual(1)
    const fringe = sampleAtPanelUv(0.5, vOutside, input)
    const edge = sampleAtPanelUv(0.5, 1, input)
    expect(edge.outer).toBeCloseTo(0.5, 5)
    expect(fringe.outer).toBeGreaterThan(0)
    expect(fringe.outer).toBeLessThan(edge.outer)
  })
})

describe('content clips to the inner (border-inset) box', () => {
  const dims = [100, 50] as const
  const bordered = {
    dimensions: dims,
    borderSizes: [8, 8, 8, 8] as const,
    borderRadius: NO_RADIUS,
  }

  it('renders pure border in the middle of the border ring', () => {
    // 4 px inside the left edge, mid height — inside the 8 px border ring
    const { outer, inner, transition } = sampleAtPanelUv(4 / dims[0], 0.5, bordered)
    expect(outer).toBe(1)
    expect(inner).toBe(0)
    expect(transition).toBe(0)
  })

  it('keeps the outer AA fringe border-colored — content must not bleed past the border', () => {
    // 0.2 px OUTSIDE the outer edge: partial coverage, in the dilated fringe.
    // Upstream's `step(0.1, outer - inner)` formula flipped this sliver to the
    // BACKGROUND color (transition = 1) — the white bleed outside a black
    // border. The SDF-gap test must keep it border-colored (transition = 0).
    const { outer, transition } = sampleAtPanelUv(-0.2 / dims[0], 0.5, bordered)
    expect(outer).toBeGreaterThan(0)
    expect(outer).toBeLessThan(0.5)
    expect(transition).toBe(0)
  })

  it('shows content only past the border inset', () => {
    // 1 px inside the inner box (9 px from the outer edge) — beyond the AA
    const insideInner = sampleAtPanelUv(9 / dims[0], 0.5, bordered)
    expect(insideInner.inner).toBe(1)
    expect(insideInner.transition).toBe(1)
    // exactly on the inner box edge — half coverage, half transition
    const onInner = sampleAtPanelUv(8 / dims[0], 0.5, bordered)
    expect(onInner.inner).toBeCloseTo(0.5, 5)
    expect(onInner.transition).toBeCloseTo(0.5, 5)
  })

  it('clips content to the inner ROUNDED box at a bordered corner', () => {
    const rounded = {
      dimensions: dims,
      borderSizes: [8, 8, 8, 8] as const,
      // radius 16 px = 0.32 · height (bottom-left corner in the packed order)
      borderRadius: [0.32, 0.32, 0.32, 0.32] as const,
    }
    // along the bottom-left corner diagonal: on the OUTER arc's midpoint the
    // fragment is inside the panel but outside the inner (border-inset) arc
    const cx = 16 / dims[0]
    const cy = 16 / dims[1]
    const diag = 1 / Math.SQRT2
    // point on the arc r = 12 px from the corner center (outer 16, inner 8)
    const u = cx - (12 / dims[0]) * diag
    const v = cy - (12 / dims[1]) * diag
    const { outer, inner, transition } = sampleAtPanelUv(u, v, rounded)
    expect(outer).toBe(1)
    expect(inner).toBe(0)
    expect(transition).toBe(0)
  })

  it('treats borderless panels as pure content out to the silhouette', () => {
    const borderless = {
      dimensions: dims,
      borderSizes: [0, 0, 0, 0] as const,
      borderRadius: NO_RADIUS,
    }
    for (const u of [-0.2 / dims[0], 0, 4 / dims[0], 0.5]) {
      const { transition } = sampleAtPanelUv(u, 0.5, borderless)
      expect(transition).toBe(1)
    }
  })
})

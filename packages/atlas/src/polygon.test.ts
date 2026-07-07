import { describe, it, expect } from 'vitest'
import { polygonizeAlpha, earClip } from './polygon'
import { packRects } from './pack'
import { bakeAtlas, type AtlasSource } from './bake'

/** Render a filled circle into an RGBA buffer. */
function circleSource(name: string, size: number, radius: number): AtlasSource {
  const rgba = new Uint8Array(size * size * 4)
  const c = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      if (dx * dx + dy * dy <= radius * radius) {
        const o = (y * size + x) * 4
        rgba[o] = 255
        rgba[o + 1] = 255
        rgba[o + 2] = 255
        rgba[o + 3] = 255
      }
    }
  }
  return { name, width: size, height: size, rgba }
}

function polygonArea(points: [number, number][]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!
    const [x2, y2] = points[(i + 1) % points.length]!
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area / 2)
}

describe('polygonizeAlpha', () => {
  it('traces a circle to a budgeted polygon that hugs the silhouette', () => {
    const source = circleSource('circle', 64, 28)
    const polygon = polygonizeAlpha(source.rgba, 64, 64, { vertexBudget: 12 })!

    expect(polygon.outline.length).toBeGreaterThanOrEqual(4)
    expect(polygon.outline.length).toBeLessThanOrEqual(12)
    expect(polygon.triangles.length).toBe((polygon.outline.length - 2) * 3)

    // The polygon should be meaningfully smaller than the full quad
    // (a 12-gon around a r=28 circle in a 64px frame ≈ 60% of the quad)
    const area = polygonArea(polygon.outline)
    expect(area).toBeLessThan(64 * 64 * 0.85)
    // ...but must fully contain the disc area (approximately — padding
    // pushes outward, simplification stays within budgeted tolerance)
    expect(area).toBeGreaterThan(Math.PI * 28 * 28 * 0.8)
  })

  it('returns null for fully-transparent frames', () => {
    const rgba = new Uint8Array(16 * 16 * 4)
    expect(polygonizeAlpha(rgba, 16, 16)).toBeNull()
  })

  it('returns the trivial rect for fully-opaque frames', () => {
    const rgba = new Uint8Array(8 * 8 * 4).fill(255)
    const polygon = polygonizeAlpha(rgba, 8, 8)!
    expect(polygon.outline.length).toBe(4)
    expect(polygon.triangles.length).toBe(6)
  })

  it('respects the alpha threshold', () => {
    const rgba = new Uint8Array(8 * 8 * 4)
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 4 // below default 8
    expect(polygonizeAlpha(rgba, 8, 8)).toBeNull()
    expect(polygonizeAlpha(rgba, 8, 8, { alphaThreshold: 2 })).not.toBeNull()
  })
})

describe('earClip', () => {
  it('triangulates a non-convex polygon', () => {
    // An arrow shape (concave at index 3)
    const outline: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 2],
      [0, 4],
    ]
    const triangles = earClip(outline)
    expect(triangles.length).toBe((outline.length - 2) * 3)
  })
})

describe('packRects', () => {
  it('packs without overlaps and inside bounds', () => {
    const result = packRects(
      Array.from({ length: 10 }, (_, i) => ({
        name: `s${i}`,
        width: 16 + (i % 3) * 8,
        height: 16 + (i % 4) * 8,
      })),
      2
    )
    expect(result.rects.length).toBe(10)
    for (const a of result.rects) {
      expect(a.x + a.width).toBeLessThanOrEqual(result.width)
      expect(a.y + a.height).toBeLessThanOrEqual(result.height)
      for (const b of result.rects) {
        if (a === b) continue
        const overlap =
          a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
        expect(overlap).toBe(false)
      }
    }
  })
})

describe('bakeAtlas', () => {
  it('bakes sources into a page + loader-compatible JSON with mesh fields', () => {
    const baked = bakeAtlas([circleSource('ball', 32, 14), circleSource('orb', 48, 20)], {
      vertexBudget: 10,
    })

    expect(Object.keys(baked.json.frames).sort()).toEqual(['ball', 'orb'])
    for (const frame of Object.values(baked.json.frames)) {
      expect(frame.mesh).toBeDefined()
      expect(frame.mesh!.verts.length).toBeGreaterThanOrEqual(4)
      // Locals live in the unit quad; UVs in [0, 1]
      for (const [x, y, u, v] of frame.mesh!.verts) {
        expect(Math.abs(x)).toBeLessThanOrEqual(0.51)
        expect(Math.abs(y)).toBeLessThanOrEqual(0.51)
        expect(u).toBeGreaterThanOrEqual(-0.01)
        expect(u).toBeLessThanOrEqual(1.01)
        expect(v).toBeGreaterThanOrEqual(-0.01)
        expect(v).toBeLessThanOrEqual(1.01)
      }
    }

    // The page carries the pixels at the packed rects
    const ball = baked.json.frames['ball']!
    const centerOffset =
      ((ball.frame.y + 16) * baked.page.width + (ball.frame.x + 16)) * 4 + 3
    expect(baked.page.rgba[centerOffset]).toBe(255)
  })

  it('skips mesh output when polygons are disabled', () => {
    const baked = bakeAtlas([circleSource('ball', 32, 14)], { polygons: false })
    expect(baked.json.frames['ball']!.mesh).toBeUndefined()
  })
})

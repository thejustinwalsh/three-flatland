import { describe, it, expect } from 'vitest'
import { bakeNormalMap } from './bake.js'

// ─── helpers ──────────────────────────────────────────────────────────────

function solidPixels(width: number, height: number, alpha = 255): Uint8Array {
  const buf = new Uint8Array(width * height * 4)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 255
    buf[i + 1] = 255
    buf[i + 2] = 255
    buf[i + 3] = alpha
  }
  return buf
}

function rgbAt(
  buf: Uint8Array,
  x: number,
  y: number,
  w: number
): [number, number, number] {
  const i = (y * w + x) * 4
  return [buf[i]!, buf[i + 1]!, buf[i + 2]!]
}

/**
 * Decoded normal `(x, y, z)` in [-1, 1]. Matches the runtime reconstruction:
 * R/G are nx/ny in [-1, 1]; nz is `sqrt(max(0, 1 − nx² − ny²))`.
 * B carries elevation now, not nz — use `elevationAt` to read it.
 */
function normalAt(
  buf: Uint8Array,
  x: number,
  y: number,
  w: number
): [number, number, number] {
  const [r, g] = rgbAt(buf, x, y, w)
  const nx = (r / 255) * 2 - 1
  const ny = (g / 255) * 2 - 1
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
  return [nx, ny, nz]
}

/** Decoded elevation at a texel (B channel), in [0, 1]. */
function elevationAt(buf: Uint8Array, x: number, y: number, w: number): number {
  const [, , b] = rgbAt(buf, x, y, w)
  return b / 255
}

// ─── tests ────────────────────────────────────────────────────────────────

describe('bakeNormalMap — empty descriptor = whole-texture flat region', () => {
  it('matches the legacy flat-texture alpha bake (fully opaque → flat normal)', () => {
    const w = 4
    const h = 4
    const out = bakeNormalMap(solidPixels(w, h), w, h)
    // Fully opaque input has no alpha gradient → normal is (0, 0, 1).
    const [nx, ny, nz] = normalAt(out, 2, 2, w)
    expect(Math.abs(nx)).toBeLessThan(0.01)
    expect(Math.abs(ny)).toBeLessThan(0.01)
    expect(nz).toBeCloseTo(1, 2)
  })
})

describe('bakeNormalMap — single region with direction=south, pitch=π/4', () => {
  it('produces normals with Y ≈ −sin(π/4) and Z ≈ cos(π/4) on fully-opaque input', () => {
    const w = 8
    const h = 8
    const out = bakeNormalMap(solidPixels(w, h), w, h, {
      direction: 'south',
      pitch: Math.PI / 4,
      bump: 'none', // no per-texel variation — expect uniform tilt everywhere
    })
    const [nx, ny, nz] = normalAt(out, 4, 4, w)
    expect(Math.abs(nx)).toBeLessThan(0.01)
    expect(ny).toBeCloseTo(-Math.sin(Math.PI / 4), 2)
    expect(nz).toBeCloseTo(Math.cos(Math.PI / 4), 2)
  })

  it('direction=up produces positive Y component', () => {
    const w = 4
    const h = 4
    const out = bakeNormalMap(solidPixels(w, h), w, h, {
      direction: 'up',
      pitch: Math.PI / 4,
      bump: 'none',
    })
    const [, ny] = normalAt(out, 2, 2, w)
    expect(ny).toBeCloseTo(Math.sin(Math.PI / 4), 2)
  })

  it('direction=east produces positive X component', () => {
    const w = 4
    const h = 4
    const out = bakeNormalMap(solidPixels(w, h), w, h, {
      direction: 'east',
      pitch: Math.PI / 4,
      bump: 'none',
    })
    const [nx] = normalAt(out, 2, 2, w)
    expect(nx).toBeCloseTo(Math.sin(Math.PI / 4), 2)
  })

  it('direction=flat produces a flat normal regardless of pitch', () => {
    const w = 4
    const h = 4
    const out = bakeNormalMap(solidPixels(w, h), w, h, {
      direction: 'flat',
      pitch: 1.2, // should be ignored when flat
      bump: 'none',
    })
    const [nx, ny, nz] = normalAt(out, 2, 2, w)
    expect(Math.abs(nx)).toBeLessThan(0.01)
    expect(Math.abs(ny)).toBeLessThan(0.01)
    expect(nz).toBeCloseTo(1, 2)
  })
})

describe('bakeNormalMap — multi-region with region-local alpha clamping', () => {
  it('clamps the alpha gradient inside each region (no cross-region bleed)', () => {
    // Two horizontally-adjacent 4×4 regions. Left region has alpha=255
    // everywhere; right region has alpha=0 everywhere. Under WHOLE-texture
    // baking, the boundary texels would see a huge `dx` jump (→ normal
    // tilts hard in X). Under region-local clamping, each region is
    // internally uniform, so both regions produce flat normals.
    const w = 8
    const h = 4
    const input = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        input[idx] = 255
        input[idx + 1] = 255
        input[idx + 2] = 255
        input[idx + 3] = x < w / 2 ? 255 : 0
      }
    }

    const out = bakeNormalMap(input, w, h, {
      regions: [
        { x: 0, y: 0, w: 4, h: 4 }, // left region
        { x: 4, y: 0, w: 4, h: 4 }, // right region
      ],
    })

    // Border texels of each region — must be flat despite the alpha
    // cliff at x=3/x=4.
    for (const x of [3, 4]) {
      const [nx, ny, nz] = normalAt(out, x, 2, w)
      expect(Math.abs(nx)).toBeLessThan(0.01)
      expect(Math.abs(ny)).toBeLessThan(0.01)
      expect(nz).toBeCloseTo(1, 2)
    }
  })
})

describe('bakeNormalMap — bump × tilt composition', () => {
  it('preserves per-texel bump on top of a tilted region', () => {
    // Alpha gradient inside a single tilted region. At least one of the
    // bumped texels should produce a normal meaningfully different from
    // the uniform-tilt baseline — proves the bump survives the tilt.
    const w = 8
    const h = 8
    const input = solidPixels(w, h, 255)
    // Alpha hole in the center → alpha gradient points inward.
    const holeIdx = (4 * w + 4) * 4
    input[holeIdx + 3] = 0

    const tilted = bakeNormalMap(input, w, h, {
      direction: 'south',
      pitch: Math.PI / 4,
      bump: 'alpha',
    })
    const flatTilted = bakeNormalMap(input, w, h, {
      direction: 'south',
      pitch: Math.PI / 4,
      bump: 'none',
    })

    // Texel adjacent to the hole: should differ from the no-bump
    // equivalent. Pick (3, 4) — sits just west of the hole.
    const withBump = normalAt(tilted, 3, 4, w)
    const noBump = normalAt(flatTilted, 3, 4, w)
    const delta = Math.hypot(
      withBump[0] - noBump[0],
      withBump[1] - noBump[1],
      withBump[2] - noBump[2]
    )
    expect(delta).toBeGreaterThan(0.01)
  })
})

describe('bakeNormalMap — color-channel bump modes', () => {
  it('luminance mode derives bump from RGB, not alpha', () => {
    // 4x1 strip: dark | dark | bright | bright. Fully opaque everywhere,
    // so `bump: 'alpha'` would produce a flat normal. Luminance mode
    // should produce a nonzero dx gradient at the dark/bright boundary.
    const w = 4
    const h = 1
    const input = new Uint8Array(w * h * 4)
    for (let i = 0; i < w; i++) {
      const v = i < w / 2 ? 0 : 255
      input[i * 4] = v
      input[i * 4 + 1] = v
      input[i * 4 + 2] = v
      input[i * 4 + 3] = 255
    }

    const alphaBake = bakeNormalMap(input, w, h, { bump: 'alpha' })
    const lumBake = bakeNormalMap(input, w, h, { bump: 'luminance' })

    // Alpha bake: uniform flat → (r=128, g=128, b=elevation) everywhere.
    // Default elevation is 0 (ground plane).
    for (let x = 0; x < w; x++) {
      const [r, g, b] = rgbAt(alphaBake, x, 0, w)
      expect(r).toBe(128)
      expect(g).toBe(128)
      expect(b).toBe(0)
    }

    // Luminance bake: at the transition (x=1 or x=2), dx is negative
    // going right (bright→... actually, the dark-bright boundary has
    // hR > hL on the left side of the boundary). Check that a pixel
    // near the boundary has r != 128 (non-flat x component).
    const [rMid] = normalAt(lumBake, 1, 0, w)
    expect(Math.abs(rMid)).toBeGreaterThan(0.01)
  })

  it('red-channel bump reads only the red channel', () => {
    // Red channel varies, green/blue/alpha constant. Gradient must come
    // entirely from red.
    const w = 4
    const h = 1
    const input = new Uint8Array(w * h * 4)
    for (let i = 0; i < w; i++) {
      input[i * 4] = i < w / 2 ? 0 : 255
      input[i * 4 + 1] = 128
      input[i * 4 + 2] = 128
      input[i * 4 + 3] = 255
    }

    const out = bakeNormalMap(input, w, h, { bump: 'red' })
    const [rMid] = normalAt(out, 1, 0, w)
    expect(Math.abs(rMid)).toBeGreaterThan(0.01)
  })

  it('negative strength inverts the bump direction', () => {
    // Same luminance gradient, one with positive strength and one with
    // negative. The x-component of the resulting normal should have
    // opposite signs near the transition.
    const w = 4
    const h = 1
    const input = new Uint8Array(w * h * 4)
    for (let i = 0; i < w; i++) {
      const v = i < w / 2 ? 0 : 255
      input[i * 4] = v
      input[i * 4 + 1] = v
      input[i * 4 + 2] = v
      input[i * 4 + 3] = 255
    }

    const pos = bakeNormalMap(input, w, h, { bump: 'luminance', strength: 1 })
    const neg = bakeNormalMap(input, w, h, { bump: 'luminance', strength: -1 })
    const [rPos] = normalAt(pos, 1, 0, w)
    const [rNeg] = normalAt(neg, 1, 0, w)
    expect(Math.sign(rPos)).toBe(-Math.sign(rNeg))
  })
})

describe('bakeNormalMap — alpha preservation', () => {
  it('copies source alpha through to output', () => {
    const w = 4
    const h = 4
    const input = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      input[i * 4 + 3] = (i * 17) % 256
    }
    const out = bakeNormalMap(input, w, h)
    for (let i = 0; i < w * h; i++) {
      expect(out[i * 4 + 3]).toBe(input[i * 4 + 3])
    }
  })
})

describe('bakeNormalMap — texels outside every region default to flat', () => {
  it('leaves uncovered texels at (0, 0, 1) with source alpha', () => {
    const w = 8
    const h = 8
    const input = solidPixels(w, h, 200)

    // Single region covering only the top-left 4×4 quadrant.
    const out = bakeNormalMap(input, w, h, {
      regions: [{ x: 0, y: 0, w: 4, h: 4, direction: 'south' }],
      pitch: Math.PI / 4,
    })

    // Uncovered texel (6, 6) — flat normal (nx=0, ny=0 → nz reconstructs
    // to 1), elevation 0, alpha copied.
    const [r, g, b] = rgbAt(out, 6, 6, w)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(0)
    expect(out[(6 * w + 6) * 4 + 3]).toBe(200)
  })
})

describe('bakeNormalMap — elevation channel (B)', () => {
  it('writes region elevation to the B channel, clamped to [0, 1]', () => {
    const w = 8
    const h = 2
    const input = solidPixels(w, h, 255)
    const out = bakeNormalMap(input, w, h, {
      regions: [
        { x: 0, y: 0, w: 4, h: 2, elevation: 1 },    // cap
        { x: 4, y: 0, w: 4, h: 2, elevation: 0.5 },  // face
      ],
    })
    expect(elevationAt(out, 1, 1, w)).toBeCloseTo(1, 2)
    expect(elevationAt(out, 5, 1, w)).toBeCloseTo(0.5, 2)
  })

  it('defaults to descriptor.elevation when a region omits it', () => {
    const w = 4
    const h = 1
    const out = bakeNormalMap(solidPixels(w, h), w, h, {
      elevation: 0.75,
      regions: [{ x: 0, y: 0, w, h }],
    })
    expect(elevationAt(out, 2, 0, w)).toBeCloseTo(0.75, 2)
  })

  it('defaults to 0 when neither region nor descriptor specifies', () => {
    const w = 4
    const h = 1
    const out = bakeNormalMap(solidPixels(w, h), w, h)
    expect(elevationAt(out, 2, 0, w)).toBe(0)
  })

  it('clamps out-of-range values to [0, 1]', () => {
    const w = 4
    const h = 1
    const overOut = bakeNormalMap(solidPixels(w, h), w, h, { elevation: 9 })
    const underOut = bakeNormalMap(solidPixels(w, h), w, h, { elevation: -1 })
    expect(elevationAt(overOut, 2, 0, w)).toBe(1)
    expect(elevationAt(underOut, 2, 0, w)).toBe(0)
  })

  it('reconstructed nz is close to cos(pitch) for a tilted region', () => {
    // R/G carry nx/ny. Runtime reconstructs nz = sqrt(1 − nx² − ny²).
    // A bake-no-bump region with direction='south' at pitch π/4 should
    // produce nx≈0, ny≈−sin(π/4), and the reconstructed nz≈cos(π/4).
    const w = 4
    const h = 4
    const out = bakeNormalMap(solidPixels(w, h), w, h, {
      direction: 'south',
      pitch: Math.PI / 4,
      bump: 'none',
    })
    const [nx, ny, nz] = normalAt(out, 2, 2, w)
    expect(Math.abs(nx)).toBeLessThan(0.01)
    expect(ny).toBeCloseTo(-Math.sin(Math.PI / 4), 2)
    expect(nz).toBeCloseTo(Math.cos(Math.PI / 4), 2)
  })
})

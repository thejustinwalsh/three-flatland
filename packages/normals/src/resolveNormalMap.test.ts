import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveNormalMap } from './resolveNormalMap.js'
import type { NormalSourceDescriptor } from './descriptor.js'

const descriptor: NormalSourceDescriptor = { version: 1, pitch: Math.PI / 4, regions: [] }

const originalFetch = global.fetch

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('resolveNormalMap — disableRuntimeBake', () => {
  it('returns a 1x1 flat-default DataTexture when disableRuntimeBake is true and no sidecar exists', async () => {
    // HEAD probe → 404 (no sidecar), then disableRuntimeBake short-circuits
    // before bakeInMemory would try to fetch the source.
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch
    const tex = await resolveNormalMap('/missing.png', descriptor, { disableRuntimeBake: true })
    expect(tex.image.width).toBe(1)
    expect(tex.image.height).toBe(1)
    // Pixel encoding: nx=128, ny=128, elevation=0, alpha=255
    const pixels = tex.image.data as Uint8Array
    expect(pixels[0]).toBe(128)
    expect(pixels[1]).toBe(128)
    expect(pixels[2]).toBe(0)
    expect(pixels[3]).toBe(255)
  })

  it('honors flipY when provided to the flat-default path', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch
    const tex = await resolveNormalMap('/missing.png', descriptor, {
      disableRuntimeBake: true,
      flipY: true,
    })
    expect(tex.flipY).toBe(true)
  })
})

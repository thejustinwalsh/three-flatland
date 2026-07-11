import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SlugShapeSetLoader } from './SlugShapeSetLoader'
import { SlugShapeSet } from './SlugShapeSet'
import { packShapeSet } from './bake'
import { lineToQuadratic } from './pipeline/fontParser'
import type { QuadContour } from './types'

function rect(x0: number, y0: number, x1: number, y1: number): QuadContour {
  const s = 1 / 1024
  return [
    lineToQuadratic(x0, y0, x1, y0, s),
    lineToQuadratic(x1, y0, x1, y1, s),
    lineToQuadratic(x1, y1, x0, y1, s),
    lineToQuadratic(x0, y1, x0, y0, s),
  ]
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** One-shape baked `.shapes.glb`, ready to hand to a stubbed `fetch`. */
async function bakedGlbBytes(): Promise<Uint8Array> {
  const set = new SlugShapeSet()
  set.registerShape([rect(0, 0, 1, 1)])
  return packShapeSet(set)
}

describe('SlugShapeSetLoader', () => {
  beforeEach(() => {
    SlugShapeSetLoader.clearCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('static load fetches and decodes a baked shape set', async () => {
    const bytes = await bakedGlbBytes()
    const fetchMock = vi.fn().mockResolvedValue(new Response(toArrayBuffer(bytes), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const set = await SlugShapeSetLoader.load('/icons.shapes.glb')
    expect(set).toBeInstanceOf(SlugShapeSet)
    expect(set.shapeCount).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith('/icons.shapes.glb')
  })

  it('caches by URL: a second load reuses the first promise', async () => {
    const bytes = await bakedGlbBytes()
    const fetchMock = vi.fn().mockResolvedValue(new Response(toArrayBuffer(bytes), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const p1 = SlugShapeSetLoader.load('/icons.shapes.glb')
    const p2 = SlugShapeSetLoader.load('/icons.shapes.glb')
    expect(p1).toBe(p2)
    await p1
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clearCache forces a re-fetch', async () => {
    const bytes = await bakedGlbBytes()
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(toArrayBuffer(bytes), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await SlugShapeSetLoader.load('/icons.shapes.glb')
    SlugShapeSetLoader.clearCache()
    await SlugShapeSetLoader.load('/icons.shapes.glb')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects with a descriptive HTTP-status error on a bad response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: 'Not Found' }))
    )

    await expect(SlugShapeSetLoader.load('/missing.shapes.glb')).rejects.toThrow(
      /HTTP 404 Not Found/
    )
  })

  it('loadAsync (instance API) matches the static load result', async () => {
    const bytes = await bakedGlbBytes()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(toArrayBuffer(bytes), { status: 200 }))
    )

    const loader = new SlugShapeSetLoader()
    const set = await loader.loadAsync('/icons.shapes.glb')
    expect(set).toBeInstanceOf(SlugShapeSet)
    expect(set.shapeCount).toBe(1)
  })

  it('loadAsync bypasses the static cache (own fetch per call)', async () => {
    const bytes = await bakedGlbBytes()
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(toArrayBuffer(bytes), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const loader = new SlugShapeSetLoader()
    await loader.loadAsync('/icons.shapes.glb')
    await SlugShapeSetLoader.load('/icons.shapes.glb')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('instance load (callback API) resolves via manager.resolveURL', async () => {
    const bytes = await bakedGlbBytes()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(toArrayBuffer(bytes), { status: 200 }))
    )

    const loader = new SlugShapeSetLoader()
    const loaded = await new Promise<SlugShapeSet>((resolve, reject) => {
      loader.load('/icons.shapes.glb', resolve, undefined, reject)
    })
    expect(loaded).toBeInstanceOf(SlugShapeSet)
    expect(loaded.shapeCount).toBe(1)
  })

  it('instance load routes fetch failures to onError instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

    const loader = new SlugShapeSetLoader()
    const err = await new Promise<unknown>((resolve) => {
      loader.load(
        '/broken.shapes.glb',
        () => resolve(new Error('onLoad should not have fired')),
        undefined,
        resolve
      )
    })
    expect(String(err)).toMatch(/HTTP 500/)
  })
})

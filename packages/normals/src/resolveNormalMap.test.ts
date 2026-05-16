import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { _resetDevtimeWarnings } from '@three-flatland/bake'
import { resolveNormalMap } from './resolveNormalMap.js'
import type { NormalSourceDescriptor } from './descriptor.js'

const descriptor: NormalSourceDescriptor = { version: 1, pitch: Math.PI / 4, regions: [] }

const originalFetch = global.fetch
const originalCIB = (global as any).createImageBitmap
const originalOC = (global as any).OffscreenCanvas

beforeEach(() => {
  vi.restoreAllMocks()
  _resetDevtimeWarnings()
})

afterEach(() => {
  global.fetch = originalFetch
  ;(global as any).createImageBitmap = originalCIB
  ;(global as any).OffscreenCanvas = originalOC
})

function stubBakeEnv() {
  ;(global as any).createImageBitmap = vi.fn(async () => ({
    width: 1,
    height: 1,
    close: () => {},
  } as ImageBitmap))
  ;(global as any).OffscreenCanvas = class {
    width: number
    height: number
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
    }
    getContext() {
      return {
        drawImage: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4).fill(128),
        }),
      }
    }
  }
}

describe('resolveNormalMap — forceRuntime', () => {
  it('skips the HEAD probe and goes straight to in-memory bake', async () => {
    const fetchCalls: Array<{ url: string; method?: string }> = []
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), method: init?.method })
      // Only GET for the source image — never a HEAD.
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 })
    }) as unknown as typeof fetch
    stubBakeEnv()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tex = await resolveNormalMap('/sprite.png', descriptor, { forceRuntime: true })
    expect(tex).toBeDefined()
    // No HEAD: only the GET to fetch the source image.
    expect(fetchCalls.some((c) => c.method === 'HEAD')).toBe(false)
    // No "no baked sibling" warn — the dev opted out of the probe knowingly.
    expect(warn).not.toHaveBeenCalled()
  })

  it('forwards flipY through the bake path', async () => {
    global.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 })
    ) as unknown as typeof fetch
    stubBakeEnv()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tex = await resolveNormalMap('/sprite.png', descriptor, {
      forceRuntime: true,
      flipY: true,
    })
    expect(tex.flipY).toBe(true)
  })
})

describe('resolveNormalMap — default probe → bake-on-miss', () => {
  it('warns and bakes when HEAD returns 404', async () => {
    const fetchCalls: Array<{ method?: string }> = []
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      fetchCalls.push({ method: init?.method })
      if (init?.method === 'HEAD') return new Response(null, { status: 404 })
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 })
    }) as unknown as typeof fetch
    stubBakeEnv()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tex = await resolveNormalMap('/sprite.png', descriptor)
    expect(tex).toBeDefined()
    // Probe fired, then source fetch.
    expect(fetchCalls.some((c) => c.method === 'HEAD')).toBe(true)
    // Devtime warn fires so missing sidecars are loud.
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('No baked sibling')
  })
})

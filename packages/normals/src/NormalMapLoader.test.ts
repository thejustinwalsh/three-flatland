import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NormalMapLoader, _resetDevtimeWarnings } from './NormalMapLoader.js'
import type { NormalSourceDescriptor } from './descriptor.js'

// Minimal stub for a Texture instance — TextureLoader's onLoad callback
// receives a real Texture in the browser; here we just need any object so we
// can verify the path routing.
const fakeTexture = { isTexture: true } as unknown as Parameters<
  Parameters<typeof NormalMapLoader.load>[0] extends string
    ? (_: unknown) => void
    : never
>[0]

describe('NormalMapLoader', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    NormalMapLoader.clearCache()
    _resetDevtimeWarnings()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns null when no baked file exists (HEAD 404)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await NormalMapLoader.load('/sprites/knight.png')
    expect(result).toBeNull()
    // dev-time warning should have fired once
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('No baked normal sibling')
    expect(String(warn.mock.calls[0]![0])).toContain('flatland-bake normal')
  })

  it('does not warn when the baked path is used', async () => {
    // HEAD returns 200; TextureLoader is stubbed via module mock below — for
    // this test we skip the actual TextureLoader round-trip by returning
    // early: set forceRuntime=false, HEAD 200, but also stub TextureLoader
    // via the prototype so it immediately onLoads with a stub texture.
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const { TextureLoader } = await import('three')
    const loadSpy = vi
      .spyOn(TextureLoader.prototype, 'load')
      .mockImplementation((_url, onLoad) => {
        // Invoke the callback directly — `_tryLoadBaked` wraps this in a
        // `new Promise((resolve) => loader.load(...))`, so `resolve` is
        // already bound by the time this mock runs and a synchronous call
        // resolves the promise on this tick. No timer needed to simulate
        // "eventually calls back": the signal *is* the callback firing.
        onLoad?.(fakeTexture as never)
        return fakeTexture as never
      })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await NormalMapLoader.load('/sprites/knight.png')
    expect(result).toBe(fakeTexture)
    expect(warn).not.toHaveBeenCalled()
    loadSpy.mockRestore()
  })

  it('skips the baked probe when forceRuntime is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await NormalMapLoader.load('/sprites/knight.png', {
      forceRuntime: true,
    })
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches results per (url, forceRuntime) pair', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    globalThis.fetch = fetchMock
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await NormalMapLoader.load('/sprites/knight.png')
    await NormalMapLoader.load('/sprites/knight.png')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await NormalMapLoader.load('/sprites/knight.png', { forceRuntime: true })
    // forceRuntime path skips the HEAD probe — no descriptor here, so it
    // returns null without fetching. Distinct cache key from the default
    // call, so a subsequent default call still only hits HEAD once total.
    await NormalMapLoader.load('/sprites/knight.png')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('dedupes the dev-time warning per URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await NormalMapLoader.load('/a.png')
    NormalMapLoader.clearCache()
    await NormalMapLoader.load('/a.png')
    NormalMapLoader.clearCache()
    await NormalMapLoader.load('/b.png')

    // One warning for '/a.png' (deduped on second call) + one for '/b.png'.
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('falls through to runtime when HEAD ok but TextureLoader fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const { TextureLoader } = await import('three')
    vi.spyOn(TextureLoader.prototype, 'load').mockImplementation(
      (_url, _onLoad, _onProgress, onError) => {
        // Same reasoning as the onLoad mock above: call the error callback
        // directly instead of scheduling it — the callback firing is the
        // signal, not the delay before it fires.
        onError?.(new Error('decode failed'))
        return fakeTexture as never
      }
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await NormalMapLoader.load('/sprites/knight.png')
    expect(result).toBeNull()
    // Two warnings: one for the decode failure, one for the runtime fallback.
    const messages = warn.mock.calls.map((c) => String(c[0]))
    expect(messages.some((m) => m.includes('TextureLoader failed'))).toBe(true)
  })
})

describe('NormalMapLoader.load — descriptor route', () => {
  const descriptor: NormalSourceDescriptor = { version: 1, pitch: Math.PI / 4, regions: [] }

  const originalFetch = globalThis.fetch

  beforeEach(() => {
    NormalMapLoader.clearCache()
    _resetDevtimeWarnings()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('routes through resolveNormalMap when a descriptor is provided', async () => {
    let calls = 0
    const originalCIB = (global as any).createImageBitmap
    const originalOC = (global as any).OffscreenCanvas
    // Stub fetch: HEAD 404 (no sidecar), GET 200 for source fetch
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      calls++
      if (init?.method === 'HEAD') return new Response(null, { status: 404 })
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 })
    }) as unknown as typeof fetch
    // Stub createImageBitmap so bakeInMemory gets a 1×1 bitmap
    ;(global as any).createImageBitmap = vi.fn(async () => ({
      width: 1,
      height: 1,
      close: () => {},
    } as ImageBitmap))
    // Stub OffscreenCanvas so imageBitmapToRGBA doesn't fall through to document
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

    try {
      const tex = await NormalMapLoader.load('/missing.png', { descriptor })
      expect(tex).not.toBeNull()
    } finally {
      globalThis.fetch = originalFetch
      ;(global as any).createImageBitmap = originalCIB
      ;(global as any).OffscreenCanvas = originalOC
    }
    expect(calls).toBeGreaterThan(0)
  })

  it('skips the probe and bakes in memory when descriptor + forceRuntime combined', async () => {
    const fetchCalls: Array<{ method?: string }> = []
    const originalCIB = (global as any).createImageBitmap
    const originalOC = (global as any).OffscreenCanvas
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      fetchCalls.push({ method: init?.method })
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 })
    }) as unknown as typeof fetch
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
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const tex = await NormalMapLoader.load('/missing.png', {
        descriptor,
        forceRuntime: true,
      })
      expect(tex).not.toBeNull()
    } finally {
      ;(global as any).createImageBitmap = originalCIB
      ;(global as any).OffscreenCanvas = originalOC
    }
    // No HEAD probe; the bake fetches the source via GET.
    expect(fetchCalls.some((c) => c.method === 'HEAD')).toBe(false)
    expect(fetchCalls.some((c) => c.method === undefined)).toBe(true)
  })

  it('preserves legacy null-on-miss + warn when no descriptor passed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tex = await NormalMapLoader.load('/missing.png')
    expect(tex).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    // The new warn message mentions "no descriptor passed"
    const calls = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(calls).toMatch(/no descriptor passed/i)
  })
})

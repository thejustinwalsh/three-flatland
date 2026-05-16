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
    // early: set skipBakedProbe=false, HEAD 200, but also stub TextureLoader
    // via the prototype so it immediately onLoads with a stub texture.
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const { TextureLoader } = await import('three')
    const loadSpy = vi
      .spyOn(TextureLoader.prototype, 'load')
      .mockImplementation((_url, onLoad) => {
        if (onLoad) setTimeout(() => onLoad(fakeTexture as never), 0)
        return fakeTexture as never
      })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await NormalMapLoader.load('/sprites/knight.png')
    expect(result).toBe(fakeTexture)
    expect(warn).not.toHaveBeenCalled()
    loadSpy.mockRestore()
  })

  it('skips the baked probe when skipBakedProbe is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    globalThis.fetch = fetchMock

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await NormalMapLoader.load('/sprites/knight.png', {
      skipBakedProbe: true,
    })
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches results per (url, skipBakedProbe) pair', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    globalThis.fetch = fetchMock
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await NormalMapLoader.load('/sprites/knight.png')
    await NormalMapLoader.load('/sprites/knight.png')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await NormalMapLoader.load('/sprites/knight.png', { skipBakedProbe: true })
    // skipBakedProbe path doesn't fetch at all, but it stores a separate cache
    // entry — a subsequent non-forced call still hits the baked path only once.
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
        if (onError) setTimeout(() => onError(new Error('decode failed')), 0)
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

  it('returns flat fallback when descriptor + disableRuntimeBake combined and no sidecar', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const tex = await NormalMapLoader.load('/missing.png', {
      descriptor,
      disableRuntimeBake: true,
    })
    expect(tex).not.toBeNull()
    // resolveNormalMap returns a 1x1 flat DataTexture
    const t = tex as any
    expect(t.image.width).toBe(1)
    expect(t.image.height).toBe(1)
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

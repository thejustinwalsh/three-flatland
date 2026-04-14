import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NormalMapLoader, _resetDevtimeWarnings } from './NormalMapLoader.js'

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
    expect(String(warn.mock.calls[0]![0])).toContain('Generating data at runtime')
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
        if (onLoad) setTimeout(() => onLoad(fakeTexture as never), 0)
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
    // forceRuntime path doesn't fetch at all, but it stores a separate cache
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

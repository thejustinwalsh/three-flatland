import { describe, it, expect, vi, afterEach } from 'vitest'
import { AlphaMap } from './AlphaMap'
import { resolveAlphaMap, ALPHA_SIDECAR_DESCRIPTOR, decodeAlphaPng } from './resolveAlphaMap'
import * as bake from '@three-flatland/bake'

afterEach(() => vi.restoreAllMocks())

describe('decodeAlphaPng', () => {
  it('reads the R channel from decoded RGBA pixels', () => {
    const rgba = new Uint8ClampedArray([200, 200, 200, 255, 10, 10, 10, 255])
    const map = decodeAlphaPng(rgba, 2, 1)
    expect(map).toBeInstanceOf(AlphaMap)
    expect(map.data[0]).toBe(200)
    expect(map.data[1]).toBe(10)
  })
})

describe('resolveAlphaMap', () => {
  it('skips the probe entirely with forceRuntime', async () => {
    const probe = vi.spyOn(bake, 'probeBakedSibling')
    const fallback = vi.fn().mockResolvedValue(new AlphaMap(new Uint8Array([1]), 1, 1))
    const map = await resolveAlphaMap('/sprites/a.png', {
      forceRuntime: true,
      runtimeFallback: fallback,
    })
    expect(probe).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledOnce()
    expect(map!.data[0]).toBe(1)
  })

  it('falls back to runtime when the sidecar probe misses', async () => {
    vi.spyOn(bake, 'probeBakedSibling').mockResolvedValue({ ok: false } as never)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fallback = vi.fn().mockResolvedValue(new AlphaMap(new Uint8Array([7]), 1, 1))
    const map = await resolveAlphaMap('/sprites/a.png', { runtimeFallback: fallback })
    expect(fallback).toHaveBeenCalledOnce()
    expect(map!.data[0]).toBe(7)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('uses the constant descriptor hash for the probe', async () => {
    const probe = vi.spyOn(bake, 'probeBakedSibling').mockResolvedValue({ ok: false } as never)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await resolveAlphaMap('/sprites/a.png', { runtimeFallback: async () => null })
    expect(probe).toHaveBeenCalledWith('/sprites/a.alpha.png', {
      expectedHash: bake.hashDescriptor(ALPHA_SIDECAR_DESCRIPTOR),
    })
  })
})

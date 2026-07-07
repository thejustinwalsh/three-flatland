import { describe, expect, it, vi } from 'vitest'
import { generateZzfxParams, type CacheStore, type LmCaller } from './lmService'
import { curatedPreset } from './presets'

// Deterministic fake hash — a real sha256 would work identically for
// these tests, but a trivial fake keeps assertions readable (the cache
// key IS the prompt text, uppercased, tagged).
function fakeHash(text: string): string {
  return `HASH(${text.length})`
}

function inMemoryCache(seed: Record<string, string> = {}): CacheStore {
  const store = new Map(Object.entries(seed))
  return {
    async get(key) {
      return store.get(key)
    },
    async set(key, value) {
      store.set(key, value)
    },
  }
}

type FakeLmCaller = LmCaller & { send: ReturnType<typeof vi.fn> }

function callerReturning(...responses: (string | null)[]): FakeLmCaller {
  let i = 0
  const send = vi.fn(async (_prompt: string, onChunk?: (c: string) => void) => {
    const response = responses[Math.min(i, responses.length - 1)]!
    i++
    if (response !== null && onChunk) {
      onChunk(response)
    }
    return response
  })
  return { send }
}

describe('generateZzfxParams', () => {
  it('returns source "lm" on a valid first response, and caches it under the prompt hash', async () => {
    const cache = inMemoryCache()
    const lm = callerReturning('{"volume":0.7,"frequency":900}')
    const result = await generateZzfxParams({
      category: 'Laser',
      styles: [],
      lm,
      cache,
      hash: () => fakeHash('fixed-key'),
    })
    expect(result.source).toBe('lm')
    expect(result.params.volume).toBeCloseTo(0.7)
    expect(result.params.frequency).toBe(900)

    // A second call with the SAME hash key hits the cache — the LM
    // caller must not be invoked again.
    const secondResult = await generateZzfxParams({
      category: 'Laser',
      styles: [],
      lm,
      cache,
      hash: () => fakeHash('fixed-key'),
    })
    expect(secondResult.source).toBe('cache')
    expect(secondResult.params).toEqual(result.params)
    expect(lm.send).toHaveBeenCalledTimes(1)
  })

  it('a cache hit short-circuits — the LM is never called', async () => {
    const cachedParams = curatedPreset('Pickup', [])
    const cache = inMemoryCache({ [fakeHash('PROMPT')]: JSON.stringify(cachedParams) })
    const lm = callerReturning('{"volume":0.1}')

    // Force a known prompt/hash by using a hash fn that ignores the prompt text.
    const result = await generateZzfxParams({
      category: 'Pickup',
      styles: [],
      lm,
      cache,
      hash: () => fakeHash('PROMPT'),
    })

    expect(result.source).toBe('cache')
    expect(lm.send).not.toHaveBeenCalled()
    expect(result.params.frequency).toBe(cachedParams.frequency)
  })

  it('falls back to a preset, source "preset", when the LM returns null (unavailable)', async () => {
    const cache = inMemoryCache()
    const lm = callerReturning(null)
    const result = await generateZzfxParams({
      category: 'Explosion',
      styles: ['boomy'],
      lm,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('preset')
    expect(result.params).toEqual(curatedPreset('Explosion', ['boomy']))
  })

  it('falls back to a preset when the LM throws', async () => {
    const cache = inMemoryCache()
    const lm: LmCaller = {
      send: vi.fn(async () => {
        throw new Error('network exploded')
      }),
    }
    const result = await generateZzfxParams({
      category: 'Hit',
      styles: [],
      lm,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('preset')
  })

  it('retries exactly once after an invalid first response, then succeeds with source "lm"', async () => {
    const cache = inMemoryCache()
    const lm = callerReturning('not json at all', '{"volume":0.4,"frequency":300}')
    const result = await generateZzfxParams({
      category: 'Jump',
      styles: [],
      lm,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('lm')
    expect(result.params.frequency).toBe(300)
    expect(lm.send).toHaveBeenCalledTimes(2)
  })

  it('falls back to a preset after the retry ALSO fails validation — never a third attempt', async () => {
    const cache = inMemoryCache()
    const lm = callerReturning('garbage', 'still garbage')
    const result = await generateZzfxParams({
      category: 'Door',
      styles: [],
      lm,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('preset')
    expect(lm.send).toHaveBeenCalledTimes(2)
  })

  it('falls back to a preset when the retry call itself returns null', async () => {
    const cache = inMemoryCache()
    const lm = callerReturning('garbage', null)
    const result = await generateZzfxParams({
      category: 'Alarm',
      styles: [],
      lm,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('preset')
    expect(lm.send).toHaveBeenCalledTimes(2)
  })

  it('never caches a preset-sourced result', async () => {
    const cache = inMemoryCache()
    const setSpy = vi.spyOn(cache, 'set')
    const lm = callerReturning(null)
    await generateZzfxParams({ category: 'Blip', styles: [], lm, cache, hash: fakeHash })
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('surfaces streamed chunks via onChunk during a live (non-cached) call', async () => {
    const cache = inMemoryCache()
    const lm = callerReturning('{"volume":0.5}')
    const chunks: string[] = []
    await generateZzfxParams({
      category: 'Blip',
      styles: [],
      lm,
      cache,
      hash: fakeHash,
      onChunk: (c) => chunks.push(c),
    })
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('a cache-store read failure is treated as a miss, not a hard failure', async () => {
    const cache: CacheStore = {
      get: vi.fn(async () => {
        throw new Error('disk on fire')
      }),
      set: vi.fn(async () => {}),
    }
    const lm = callerReturning('{"volume":0.5}')
    const result = await generateZzfxParams({
      category: 'Blip',
      styles: [],
      lm,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('lm')
  })

  it('a cache-store write failure does not fail generation', async () => {
    const cache: CacheStore = {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {
        throw new Error('disk on fire')
      }),
    }
    const lm = callerReturning('{"volume":0.5}')
    const result = await generateZzfxParams({
      category: 'Blip',
      styles: [],
      lm,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('lm')
  })

  it('a corrupt cache entry is treated as a miss and regenerates rather than failing', async () => {
    const cache = inMemoryCache({ [fakeHash('x')]: 'not valid json' })
    const lm = callerReturning('{"volume":0.5}')
    const result = await generateZzfxParams({
      category: 'Blip',
      styles: [],
      lm,
      cache,
      hash: () => fakeHash('x'),
    })
    expect(result.source).toBe('lm')
  })
})

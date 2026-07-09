import { describe, expect, it, vi } from 'vitest'
import { CATEGORIES, PARAM_ORDER, PARAM_SPECS } from '../../../../webview/audio/params'
import {
  PRESET_LIBRARY,
  PROMPT_VERSION,
  buildRetryPrompt,
  buildZzfxPrompt,
  cacheKeyFor,
  parseCandidates,
  runGeneration,
  type CacheStore,
  type LmSend,
} from './core'

function fakeHash(text: string): string {
  return `HASH(${text.length}:${text})`
}

// ─── buildZzfxPrompt ────────────────────────────────────────────────────────

describe('buildZzfxPrompt', () => {
  it('interpolates N, category, adjectives, and seeds', () => {
    const prompt = buildZzfxPrompt({
      category: 'Explosion',
      styles: ['boomy', 'low'],
      n: 4,
      seeds: [{ label: 'Boom', params: [0.6, 0.2, 80] }],
    })
    expect(prompt).toContain('Explosion')
    expect(prompt).toContain('boomy, low')
    expect(prompt).toContain('Generate 4 variations')
    expect(prompt).toContain('Output exactly 4 candidates')
    expect(prompt).toContain('[0.6,0.2,80]')
  })

  it('renders "none" adjectives and "(none)" seeds when both are empty', () => {
    const prompt = buildZzfxPrompt({ category: 'Blip', styles: [], n: 3, seeds: [] })
    expect(prompt).toContain('style: none')
    expect(prompt).toContain('(none)')
  })

  it("matches the planning doc's system-rules shape", () => {
    const prompt = buildZzfxPrompt({ category: 'Blip', styles: [], n: 3, seeds: [] })
    expect(prompt).toContain('You are ZzFX-GPT')
    expect(prompt).toContain(
      '{ "candidates": [ { "label": string, "params": number[], "rationale": string } ] }'
    )
    expect(prompt).toContain('shape MUST be an integer in 0..4')
    expect(prompt).toContain('Never wrap output in code fences or prose')
  })

  it('PROMPT_VERSION is a non-empty string, present for cache-key use', () => {
    expect(typeof PROMPT_VERSION).toBe('string')
    expect(PROMPT_VERSION.length).toBeGreaterThan(0)
  })
})

describe('buildRetryPrompt', () => {
  it('echoes the reason and truncates a long previous response', () => {
    const prompt = buildRetryPrompt('x'.repeat(2000), 'response was not valid JSON')
    expect(prompt).toContain('response was not valid JSON')
    expect(prompt.length).toBeLessThan(2000)
  })
})

// ─── parseCandidates ────────────────────────────────────────────────────────

describe('parseCandidates', () => {
  it('accepts a clean, valid response', () => {
    const result = parseCandidates(
      JSON.stringify({
        candidates: [
          { label: 'Zap', params: [0.5, 0, 1200, 0, 0.02, 0.1, 2, 1], rationale: 'quick laser' },
        ],
      })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0]!.label).toBe('Zap')
      expect(result.dropped).toHaveLength(0)
    }
  })

  it('strips a ```json fence despite the prompt saying not to', () => {
    const body = JSON.stringify({
      candidates: [{ label: 'X', params: [0.5, 0, 500, 0, 0.1, 0.1, 0, 1] }],
    })
    const result = parseCandidates(`\`\`\`json\n${body}\n\`\`\``)
    expect(result.ok).toBe(true)
  })

  it('rejects unparseable JSON (garbage)', () => {
    expect(parseCandidates('this is not json').ok).toBe(false)
  })

  it('rejects a response missing the "candidates" array', () => {
    expect(parseCandidates(JSON.stringify({ foo: 'bar' })).ok).toBe(false)
    expect(parseCandidates(JSON.stringify({ candidates: 'not an array' })).ok).toBe(false)
  })

  it('drops a candidate whose params length is out of 8..21 range, keeps the rest', () => {
    const result = parseCandidates(
      JSON.stringify({
        candidates: [
          { label: 'TooShort', params: [0.5, 0, 500] }, // length 3 < 8
          { label: 'Good', params: [0.5, 0, 500, 0, 0.1, 0.1, 0, 1] },
        ],
      })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0]!.label).toBe('Good')
      expect(result.dropped).toHaveLength(1)
      expect(result.dropped[0]!.reason).toMatch(/length/)
    }
  })

  it('drops a candidate with an out-of-range param value (frequency > 20000)', () => {
    const result = parseCandidates(
      JSON.stringify({
        candidates: [{ label: 'TooHigh', params: [0.5, 0, 99999, 0, 0.1, 0.1, 0, 1] }],
      })
    )
    expect(result.ok).toBe(false) // the only candidate was dropped -> zero survive
  })

  it('drops a candidate whose shape (index 6) is a float instead of an integer', () => {
    const result = parseCandidates(
      JSON.stringify({
        candidates: [
          { label: 'FloatShape', params: [0.5, 0, 500, 0, 0.1, 0.1, 2.5, 1] },
          { label: 'IntShape', params: [0.5, 0, 500, 0, 0.1, 0.1, 2, 1] },
        ],
      })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0]!.label).toBe('IntShape')
      expect(result.dropped[0]!.reason).toMatch(/integer/)
    }
  })

  it('drops a candidate with volume > 1', () => {
    const result = parseCandidates(
      JSON.stringify({
        candidates: [{ label: 'TooLoud', params: [1.5, 0, 500, 0, 0.1, 0.1, 0, 1] }],
      })
    )
    expect(result.ok).toBe(false)
  })

  it('fails on zero valid candidates (all dropped)', () => {
    const result = parseCandidates(
      JSON.stringify({ candidates: [{ label: 'Bad', params: [1.5, 0, 99999] }] })
    )
    expect(result.ok).toBe(false)
  })

  it('defaults a missing/blank label to "Untitled" and a missing rationale to ""', () => {
    const result = parseCandidates(
      JSON.stringify({ candidates: [{ params: [0.5, 0, 500, 0, 0.1, 0.1, 0, 1] }] })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.candidates[0]!.label).toBe('Untitled')
      expect(result.candidates[0]!.rationale).toBe('')
    }
  })
})

// ─── cacheKeyFor ────────────────────────────────────────────────────────────

describe('cacheKeyFor', () => {
  const base = { modelId: 'gpt-4', promptVersion: 'v1', category: 'Laser', n: 3, hash: fakeHash }

  it('is stable for identical inputs', () => {
    const a = cacheKeyFor({ ...base, styles: ['low', 'high'] })
    const b = cacheKeyFor({ ...base, styles: ['low', 'high'] })
    expect(a).toBe(b)
  })

  it('is invariant to style selection ORDER (sorted before hashing)', () => {
    const a = cacheKeyFor({ ...base, styles: ['high', 'low'] })
    const b = cacheKeyFor({ ...base, styles: ['low', 'high'] })
    expect(a).toBe(b)
  })

  it('differs when the style SET differs', () => {
    const a = cacheKeyFor({ ...base, styles: ['low'] })
    const b = cacheKeyFor({ ...base, styles: ['low', 'high'] })
    expect(a).not.toBe(b)
  })

  it('differs when modelId, promptVersion, category, or n differ', () => {
    const a = cacheKeyFor({ ...base, styles: [] })
    expect(cacheKeyFor({ ...base, styles: [], modelId: 'other-model' })).not.toBe(a)
    expect(cacheKeyFor({ ...base, styles: [], promptVersion: 'v2' })).not.toBe(a)
    expect(cacheKeyFor({ ...base, styles: [], category: 'Hit' })).not.toBe(a)
    expect(cacheKeyFor({ ...base, styles: [], n: 5 })).not.toBe(a)
  })
})

// ─── PRESET_LIBRARY validity ────────────────────────────────────────────────

describe('PRESET_LIBRARY', () => {
  it('has an entry for every CATEGORIES value, with at least 2 presets each', () => {
    for (const category of CATEGORIES) {
      const entries = PRESET_LIBRARY[category]
      expect(entries, `missing preset entries for "${category}"`).toBeDefined()
      expect(entries.length, `"${category}" has fewer than 2 presets`).toBeGreaterThanOrEqual(2)
    }
  })

  it('every preset passes parseCandidates validation — a bad preset cannot ship', () => {
    for (const category of CATEGORIES) {
      const candidates = PRESET_LIBRARY[category].map((entry) => ({
        label: entry.label,
        params: entry.params,
        rationale: '',
      }))
      const result = parseCandidates(JSON.stringify({ candidates }))
      expect(result.ok, `preset library for "${category}" failed validation`).toBe(true)
      if (result.ok) {
        expect(result.dropped, `preset library for "${category}" had dropped entries`).toHaveLength(
          0
        )
        expect(result.candidates).toHaveLength(PRESET_LIBRARY[category].length)
      }
    }
  })

  it('every preset param is within its PARAM_SPECS range (redundant with the above, asserted directly)', () => {
    for (const category of CATEGORIES) {
      for (const entry of PRESET_LIBRARY[category]) {
        entry.params.forEach((value, i) => {
          const key = PARAM_ORDER[i]
          if (!key) return
          const spec = PARAM_SPECS[key]
          expect(value, `${category} / ${entry.label} / ${key}`).toBeGreaterThanOrEqual(spec.min)
          expect(value, `${category} / ${entry.label} / ${key}`).toBeLessThanOrEqual(spec.max)
        })
      }
    }
  })
})

// ─── runGeneration ──────────────────────────────────────────────────────────

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

type FakeSend = LmSend & ReturnType<typeof vi.fn>

function sendReturning(...responses: (string | null)[]): FakeSend {
  let i = 0
  const fn = vi.fn(async (_prompt: string, onChunk?: (c: string) => void) => {
    const response = responses[Math.min(i, responses.length - 1)]!
    i++
    if (response !== null && onChunk) onChunk(response)
    return response
  })
  return fn as FakeSend
}

const VALID_CANDIDATE_JSON = JSON.stringify({
  candidates: [{ label: 'Zap', params: [0.5, 0, 1200, 0, 0.02, 0.1, 2, 1], rationale: 'quick' }],
})

describe('runGeneration', () => {
  it('returns source "lm" on a valid first response and caches it', async () => {
    const cache = inMemoryCache()
    const send = sendReturning(VALID_CANDIDATE_JSON)
    const result = await runGeneration({
      category: 'Laser',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('lm')
    expect(result.candidates[0]!.label).toBe('Zap')

    const second = await runGeneration({
      category: 'Laser',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send,
      cache,
      hash: fakeHash,
    })
    expect(second.source).toBe('cache')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('falls back to a preset, source "preset", when send returns null (no model)', async () => {
    const cache = inMemoryCache()
    const send = sendReturning(null)
    const result = await runGeneration({
      category: 'Explosion',
      styles: [],
      n: 2,
      modelId: 'none',
      send,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('preset')
    expect(result.candidates.map((c) => c.label)).toEqual(['Boom', 'Distant Rumble'])
  })

  it('falls back to a preset when send throws', async () => {
    const cache = inMemoryCache()
    const send: LmSend = vi.fn(async () => {
      throw new Error('network exploded')
    })
    const result = await runGeneration({
      category: 'Hit',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('preset')
  })

  it('retries exactly once after an invalid first response, then succeeds', async () => {
    const cache = inMemoryCache()
    const send = sendReturning('not json at all', VALID_CANDIDATE_JSON)
    const result = await runGeneration({
      category: 'Jump',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('lm')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('falls back to preset after the retry ALSO fails — never a third attempt', async () => {
    const cache = inMemoryCache()
    const send = sendReturning('garbage', 'still garbage')
    const result = await runGeneration({
      category: 'Door',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('preset')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('never caches a preset-sourced result', async () => {
    const cache = inMemoryCache()
    const setSpy = vi.spyOn(cache, 'set')
    const send = sendReturning(null)
    await runGeneration({
      category: 'Blip',
      styles: [],
      n: 1,
      modelId: 'none',
      send,
      cache,
      hash: fakeHash,
    })
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('surfaces streamed chunks via onChunk on a live call', async () => {
    const cache = inMemoryCache()
    const send = sendReturning(VALID_CANDIDATE_JSON)
    const chunks: string[] = []
    await runGeneration({
      category: 'Blip',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send,
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
    const send = sendReturning(VALID_CANDIDATE_JSON)
    const result = await runGeneration({
      category: 'Blip',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send,
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
    const send = sendReturning(VALID_CANDIDATE_JSON)
    const result = await runGeneration({
      category: 'Blip',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('lm')
  })

  it('a corrupt cache entry under the ACTUAL computed key is treated as a miss and regenerates', async () => {
    const key = cacheKeyFor({
      modelId: 'gpt-4',
      promptVersion: PROMPT_VERSION,
      category: 'Blip',
      styles: [],
      n: 1,
      hash: fakeHash,
    })
    const cache = inMemoryCache({ [key]: 'not valid json' })
    const send = sendReturning(VALID_CANDIDATE_JSON)
    const result = await runGeneration({
      category: 'Blip',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send,
      cache,
      hash: fakeHash,
    })
    expect(result.source).toBe('lm')
  })
})

// ─── cache persistence: concurrent writers (Finding B, #148 Z7b) ───────────

/**
 * Models `lm/service.ts`'s real `ZzfxLmService.cacheStore()` shape at the
 * file-store level: each "instance" (mirroring one `ZzfxLmService`) holds
 * its own local snapshot, loaded once from a SHARED backing object
 * standing in for the on-disk cache file. `merge: false` reproduces the
 * bug this fix closes — `set` blind-overwrites the shared backing using
 * only this instance's own (possibly-stale) local snapshot; `merge: true`
 * reproduces the fix — `set` re-reads the shared backing fresh
 * immediately before writing and merges its own key into THAT. The
 * artificial yield inside `set` forces two concurrently-invoked
 * `runGeneration` calls' `cache.set` steps to genuinely interleave rather
 * than coincidentally serialize by scheduling luck, so both tests below
 * are deterministic.
 *
 * Returns `readBacking` alongside the pair, not just the two `CacheStore`s
 * — asserting through either instance's own `get()` after the race would
 * read THAT instance's stale pre-race `local` snapshot (captured during
 * `runGeneration`'s own cache-miss check, before either `set` ran), not
 * what actually ended up persisted. `readBacking` is the one honest
 * "what's really in the file" view, matching how a real test would
 * inspect the actual written JSON blob.
 */
function fileBackedCachePair(
  merge: boolean
): [CacheStore, CacheStore, (key: string) => string | undefined] {
  const backing: Record<string, string> = {}
  function makeInstance(): CacheStore {
    let local: Record<string, string> | null = null
    return {
      async get(key) {
        local ??= { ...backing }
        return local[key]
      },
      async set(key, value) {
        local ??= { ...backing }
        local[key] = value
        await new Promise((resolve) => setTimeout(resolve, 0))
        const toWrite = merge ? { ...backing, ...local } : local
        for (const existingKey of Object.keys(backing)) delete backing[existingKey]
        Object.assign(backing, toWrite)
      },
    }
  }
  return [makeInstance(), makeInstance(), (key) => backing[key]]
}

async function generateDistinctKeys(cacheA: CacheStore, cacheB: CacheStore): Promise<void> {
  await Promise.all([
    runGeneration({
      category: 'Laser',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send: sendReturning(VALID_CANDIDATE_JSON),
      cache: cacheA,
      hash: fakeHash,
    }),
    runGeneration({
      category: 'Blip',
      styles: [],
      n: 1,
      modelId: 'gpt-4',
      send: sendReturning(VALID_CANDIDATE_JSON),
      cache: cacheB,
      hash: fakeHash,
    }),
  ])
}

const LASER_KEY = cacheKeyFor({
  modelId: 'gpt-4',
  promptVersion: PROMPT_VERSION,
  category: 'Laser',
  styles: [],
  n: 1,
  hash: fakeHash,
})
const BLIP_KEY = cacheKeyFor({
  modelId: 'gpt-4',
  promptVersion: PROMPT_VERSION,
  category: 'Blip',
  styles: [],
  n: 1,
  hash: fakeHash,
})

describe('cache persistence — concurrent writers (Finding B, #148 Z7b)', () => {
  it("BUG REPRODUCTION: two instances blind-overwriting a shared file lose a concurrent sibling's key — proves this harness can detect the failure the fix below closes", async () => {
    const [cacheA, cacheB, readBacking] = fileBackedCachePair(false)
    await generateDistinctKeys(cacheA, cacheB)

    const laserSurvived = readBacking(LASER_KEY) !== undefined
    const blipSurvived = readBacking(BLIP_KEY) !== undefined
    expect(laserSurvived && blipSurvived).toBe(false)
  })

  it('two instances sharing a read-merge-write file store both survive a concurrent distinct-key write', async () => {
    const [cacheA, cacheB, readBacking] = fileBackedCachePair(true)
    await generateDistinctKeys(cacheA, cacheB)

    expect(readBacking(LASER_KEY)).toBeDefined()
    expect(readBacking(BLIP_KEY)).toBeDefined()
  })
})

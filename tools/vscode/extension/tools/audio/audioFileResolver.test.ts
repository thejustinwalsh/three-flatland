import { describe, expect, it, vi } from 'vitest'
import {
  AudioFileResolver,
  audioFileCandidates,
  isSearchEligible,
  resolveAudioFilePath,
} from './audioFileResolver'

const SOURCE_DIR = '/ws/src/sounds'
const WORKSPACE_ROOT = '/ws'

describe('audioFileCandidates', () => {
  it('builds candidates in precedence order: source dir, workspace root, workspace root/public', () => {
    expect(audioFileCandidates('jump.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual([
      '/ws/src/sounds/jump.wav',
      '/ws/jump.wav',
      '/ws/public/jump.wav',
    ])
  })

  it('resolves a relative subpath against each candidate root', () => {
    expect(audioFileCandidates('audio/jump.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual([
      '/ws/src/sounds/audio/jump.wav',
      '/ws/audio/jump.wav',
      '/ws/public/audio/jump.wav',
    ])
  })
})

describe('resolveAudioFilePath', () => {
  it('returns the source-directory candidate when it exists — first match wins', () => {
    const exists = vi.fn((p: string) => p === '/ws/src/sounds/jump.wav')
    const result = resolveAudioFilePath('jump.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBe('/ws/src/sounds/jump.wav')
  })

  it('falls back to the workspace root when the source-directory candidate is absent', () => {
    const exists = vi.fn((p: string) => p === '/ws/jump.wav')
    const result = resolveAudioFilePath('jump.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBe('/ws/jump.wav')
  })

  it('falls back to workspace root/public last', () => {
    const exists = vi.fn((p: string) => p === '/ws/public/jump.wav')
    const result = resolveAudioFilePath('jump.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBe('/ws/public/jump.wav')
  })

  it('returns undefined when the path resolves nowhere — the lens must not appear', () => {
    const exists = vi.fn(() => false)
    const result = resolveAudioFilePath('missing.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBeUndefined()
  })

  it('source-directory precedence wins even when a same-named file also exists at workspace root', () => {
    const exists = vi.fn((p: string) => p === '/ws/src/sounds/jump.wav' || p === '/ws/jump.wav')
    const result = resolveAudioFilePath('jump.wav', SOURCE_DIR, WORKSPACE_ROOT, exists)
    expect(result).toBe('/ws/src/sounds/jump.wav')
  })
})

describe('isSearchEligible', () => {
  it('allows plainly-relative static paths, including subdirs and dot-relative', () => {
    expect(isSearchEligible('boom.wav')).toBe(true)
    expect(isSearchEligible('assets/boom.wav')).toBe(true)
    expect(isSearchEligible('./boom.wav')).toBe(true)
    expect(isSearchEligible('../shared/boom.wav')).toBe(true)
  })

  it('rejects URLs, schemes, absolute, UNC, and drive-letter paths', () => {
    expect(isSearchEligible('https://cdn.example.com/boom.mp3')).toBe(false)
    expect(isSearchEligible('data:audio/wav;base64,AAAA')).toBe(false)
    expect(isSearchEligible('file:///tmp/boom.wav')).toBe(false)
    expect(isSearchEligible('/abs/boom.wav')).toBe(false)
    expect(isSearchEligible('\\\\server\\share\\boom.wav')).toBe(false)
    expect(isSearchEligible('C:\\sounds\\boom.wav')).toBe(false)
    expect(isSearchEligible('')).toBe(false)
  })
})

describe('AudioFileResolver', () => {
  /** In-memory harness: `files` is the mutable "disk"; findByBasename
   * scans it like the real findFiles-backed search would. */
  function makeResolver(files: Set<string>) {
    const onDidUpdate = vi.fn()
    const findByBasename = vi.fn(async (basename: string) =>
      [...files].filter((p) => p.endsWith(`/${basename}`))
    )
    const resolver = new AudioFileResolver({
      exists: (p) => files.has(p),
      findByBasename,
      onDidUpdate,
    })
    return { resolver, onDidUpdate, findByBasename }
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('fast-tier hit resolves synchronously and never searches', () => {
    const { resolver, findByBasename } = makeResolver(new Set(['/ws/src/sounds/jump.wav']))
    const state = resolver.getLensState('jump.wav', SOURCE_DIR, WORKSPACE_ROOT)
    expect(state).toEqual({ state: 'resolved', path: '/ws/src/sounds/jump.wav' })
    expect(findByBasename).not.toHaveBeenCalled()
  })

  it('fast miss reports searching, then resolves via the slow search and fires onDidUpdate', async () => {
    const { resolver, onDidUpdate } = makeResolver(new Set(['/ws/media/deep/boom.wav']))
    expect(resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'searching',
    })
    await flush()
    expect(onDidUpdate).toHaveBeenCalledTimes(1)
    expect(resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'resolved',
      path: '/ws/media/deep/boom.wav',
    })
  })

  it('a second getLensState during an in-flight search reuses it — no duplicate searches', async () => {
    const { resolver, findByBasename } = makeResolver(new Set(['/ws/media/boom.wav']))
    resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    await flush()
    expect(findByBasename).toHaveBeenCalledTimes(1)
  })

  it('a settled miss reports notFound, sticky across further lens renders (no re-search)', async () => {
    const { resolver, findByBasename, onDidUpdate } = makeResolver(new Set())
    resolver.getLensState('gone.wav', SOURCE_DIR, WORKSPACE_ROOT)
    await flush()
    expect(onDidUpdate).toHaveBeenCalledTimes(1)
    expect(resolver.getLensState('gone.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'notFound',
    })
    expect(resolver.getLensState('gone.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'notFound',
    })
    expect(findByBasename).toHaveBeenCalledTimes(1)
  })

  it('URLs and absolute paths are ineligible — no lens, no search', () => {
    const { resolver, findByBasename } = makeResolver(new Set())
    expect(resolver.getLensState('https://cdn.x/boom.mp3', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'ineligible',
    })
    expect(resolver.getLensState('/abs/boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'ineligible',
    })
    expect(findByBasename).not.toHaveBeenCalled()
  })

  it('resolveForPlay trusts-and-verifies: a still-present cached path returns with no re-search', async () => {
    const files = new Set(['/ws/src/sounds/jump.wav'])
    const { resolver, findByBasename } = makeResolver(files)
    resolver.getLensState('jump.wav', SOURCE_DIR, WORKSPACE_ROOT)
    const path = await resolver.resolveForPlay('jump.wav', SOURCE_DIR, WORKSPACE_ROOT)
    expect(path).toBe('/ws/src/sounds/jump.wav')
    expect(findByBasename).not.toHaveBeenCalled()
  })

  it('lazy repair: cached path vanished → play re-resolves via the slow search to the new location', async () => {
    const files = new Set(['/ws/media/boom.wav'])
    const { resolver, onDidUpdate } = makeResolver(files)
    resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    await flush()
    // The dev moves the file after it was found and cached.
    files.delete('/ws/media/boom.wav')
    files.add('/ws/assets/relocated/boom.wav')
    const path = await resolver.resolveForPlay('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    expect(path).toBe('/ws/assets/relocated/boom.wav')
    expect(onDidUpdate).toHaveBeenCalledTimes(2)
    expect(resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'resolved',
      path: '/ws/assets/relocated/boom.wav',
    })
  })

  it('lazy repair: cached path vanished and nothing remains → undefined, lens flips to notFound', async () => {
    const files = new Set(['/ws/media/boom.wav'])
    const { resolver } = makeResolver(files)
    resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    await flush()
    files.delete('/ws/media/boom.wav')
    const path = await resolver.resolveForPlay('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    expect(path).toBeUndefined()
    expect(resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'notFound',
    })
  })

  it('retry from notFound: a play attempt after the asset is re-added finds it again', async () => {
    const files = new Set<string>()
    const { resolver } = makeResolver(files)
    resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    await flush()
    expect(resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'notFound',
    })
    files.add('/ws/media/boom.wav')
    const path = await resolver.resolveForPlay('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    expect(path).toBe('/ws/media/boom.wav')
    expect(resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'resolved',
      path: '/ws/media/boom.wav',
    })
  })

  it('picks the match whose path ends with the reference shape over a bare basename hit', async () => {
    const files = new Set(['/ws/zzz/boom.wav', '/ws/media/assets/boom.wav'])
    const { resolver } = makeResolver(files)
    resolver.getLensState('assets/boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    await flush()
    expect(resolver.getLensState('assets/boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'resolved',
      path: '/ws/media/assets/boom.wav',
    })
  })

  it('ties break to the shallowest, then lexicographically first, path — deterministic', async () => {
    const files = new Set(['/ws/deep/nested/boom.wav', '/ws/b/boom.wav', '/ws/a/boom.wav'])
    const { resolver } = makeResolver(files)
    resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)
    await flush()
    expect(resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
      state: 'resolved',
      path: '/ws/a/boom.wav',
    })
  })

  describe('clear() epoch guard (finding #3, adversarial review of PR #188)', () => {
    /** A promise this test resolves explicitly, standing in for a
     * workspace-wide `findByBasename` scan that's still running when
     * `clear()` fires. Driving it by hand (never a timer) is the signal
     * that lets the assertions run strictly after the stale search's
     * continuation has had its chance to mutate state. */
    function createDeferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>((res) => {
        resolve = res
      })
      return { promise, resolve }
    }

    /** Mirrors the private `key()` format in audioFileResolver.ts
     * (`workspaceRoot\0sourceDir\0refPath`) so the test can read the
     * resolver's internal maps directly without reaching for a private
     * method. */
    const keyFor = (refPath: string) => `${WORKSPACE_ROOT} ${SOURCE_DIR} ${refPath}`

    it('a search started before clear() does not write its result or fire onDidUpdate after it resolves', async () => {
      const onDidUpdate = vi.fn()
      const deferred = createDeferred<string[]>()
      const findByBasename = vi.fn(() => deferred.promise)
      const resolver = new AudioFileResolver({ exists: () => false, findByBasename, onDidUpdate })
      const internals = resolver as unknown as {
        cache: Map<string, string>
        searches: Map<string, Promise<string | undefined>>
        misses: Set<string>
      }
      const key = keyFor('boom.wav')

      // Fast tiers miss, path is search-eligible → kicks off the slow
      // search and captures epoch 0.
      expect(resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
        state: 'searching',
      })
      expect(findByBasename).toHaveBeenCalledTimes(1)
      const staleSearch = internals.searches.get(key)
      expect(staleSearch).toBeDefined()

      // The per-test reset: bumps the epoch and empties every map before
      // the pristine fixture is recopied in.
      resolver.clear()
      expect(internals.cache.size).toBe(0)
      expect(internals.searches.size).toBe(0)
      expect(internals.misses.size).toBe(0)

      // Only now does the previous workspace's findFiles scan settle —
      // as if it had been in flight the whole time clear() ran.
      deferred.resolve(['/ws/media/boom.wav'])
      await staleSearch

      // The obsolete search must not have repopulated the fresh maps or
      // fired a refresh for a result nobody's waiting on.
      expect(internals.cache.size).toBe(0)
      expect(internals.searches.size).toBe(0)
      expect(internals.misses.size).toBe(0)
      expect(onDidUpdate).not.toHaveBeenCalled()

      // Production behavior for the normal path is untouched: a fresh
      // lookup after the reset starts its own, independent search.
      expect(resolver.getLensState('boom.wav', SOURCE_DIR, WORKSPACE_ROOT)).toEqual({
        state: 'searching',
      })
      expect(findByBasename).toHaveBeenCalledTimes(2)
    })
  })
})

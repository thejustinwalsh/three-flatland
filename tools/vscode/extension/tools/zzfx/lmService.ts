// Pure orchestration core for the ZzFX AI Generate flow. No vscode
// import — every side effect (calling a language model, reading/writing
// a cache) is injected, so the full retry/cache/fallback state machine
// is unit-testable with fakes. `vscodeLmAdapter.ts` supplies the real
// implementations of `LmCaller`/`CacheStore`/hash for the host to wire
// in (that wiring itself is Z3's job — see ../../../webview/zzfx/README.md).
import { curatedPreset } from './presets'
import { buildPrompt, buildRetryPrompt } from './promptTemplate'
import { validateLmResponse } from './validateLmResponse'
import type { ZzfxParams } from '../../../webview/zzfx/params'

export type LmCaller = {
  /**
   * Sends `prompt` to a language model and returns the accumulated text
   * response. Returns `null` (not a rejected promise) when no model is
   * available at all — the caller falls back to a preset without
   * treating that as an error. `onChunk` fires once per streamed text
   * fragment, if the implementation streams.
   */
  send(prompt: string, onChunk?: (chunk: string) => void): Promise<string | null>
}

export type CacheStore = {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
}

export type GenerateSource = 'lm' | 'preset' | 'cache'

export type GenerateResult = {
  params: ZzfxParams
  source: GenerateSource
}

export type GenerateOptions = {
  category?: string
  styles: readonly string[]
  lm: LmCaller
  cache: CacheStore
  /** sha256 (or equivalent) hex digest — injected so tests don't need
   * Node's `crypto` and the real adapter can swap algorithms freely. */
  hash: (text: string) => string
  /** Called once per streamed chunk from a live model call. Never
   * called for a cache hit or a preset fallback — there's nothing to
   * stream in either case. */
  onChunk?: (chunk: string) => void
}

async function safeGet(cache: CacheStore, key: string): Promise<string | undefined> {
  try {
    return await cache.get(key)
  } catch {
    return undefined
  }
}

async function safeSet(cache: CacheStore, key: string, value: string): Promise<void> {
  try {
    await cache.set(key, value)
  } catch {
    // Best-effort — a cache write failure must never fail generation.
  }
}

async function safeSend(
  lm: LmCaller,
  prompt: string,
  onChunk?: (chunk: string) => void
): Promise<string | null> {
  try {
    return await lm.send(prompt, onChunk)
  } catch {
    return null
  }
}

/**
 * Generates a ZzFX param set for `category` + `styles`.
 *
 * Order of attempts:
 * 1. sha256(prompt) cache hit → `source: 'cache'`.
 * 2. Live model call, validated → `source: 'lm'`, result cached for next time.
 * 3. Model call invalid → ONE retry with a corrective follow-up prompt.
 * 4. Model unavailable, erroring, or still invalid after the retry →
 *    curated preset → `source: 'preset'`. Never cached (not LM-derived;
 *    caching it would prevent a retry once the model becomes available).
 */
export async function generateZzfxParams(options: GenerateOptions): Promise<GenerateResult> {
  const { category, styles, lm, cache, hash, onChunk } = options
  const prompt = buildPrompt(category, styles)
  const cacheKey = hash(prompt)

  const cached = await safeGet(cache, cacheKey)
  if (cached !== undefined) {
    const validated = validateLmResponse(cached)
    if (validated.ok) return { params: validated.params, source: 'cache' }
    // Corrupt/stale cache entry (format changed, etc.) — fall through
    // and regenerate rather than failing the request.
  }

  const raw = await safeSend(lm, prompt, onChunk)
  if (raw === null) {
    return { params: curatedPreset(category, styles), source: 'preset' }
  }

  let validated = validateLmResponse(raw)
  if (!validated.ok) {
    const retryPrompt = buildRetryPrompt(raw, validated.reason)
    const retryRaw = await safeSend(lm, retryPrompt, onChunk)
    validated =
      retryRaw === null ? { ok: false, reason: 'retry unavailable' } : validateLmResponse(retryRaw)
  }

  if (!validated.ok) {
    return { params: curatedPreset(category, styles), source: 'preset' }
  }

  await safeSet(cache, cacheKey, JSON.stringify(validated.params))
  return { params: validated.params, source: 'lm' }
}

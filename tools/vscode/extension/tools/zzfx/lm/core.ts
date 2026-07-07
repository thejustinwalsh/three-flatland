// Pure orchestration + data for the ZzFX AI Generate flow — NO `vscode`
// import, so the whole thing (prompt build, response validation, cache
// key, retry/cache/preset decision tree) is unit-testable without a real
// `vscode.lm`. `service.ts` supplies the real `vscode.lm`/`workspace.fs`/
// `node:crypto` plumbing this file's functions are injected with.
//
// Spec source of truth: planning/vscode-tools/tool-zzfx-studio.md
// ("AI generation" section) — the prompt template, validation rules, and
// cache-key formula below are lifted from there; keep them in sync if
// that doc changes.
import { PARAM_ORDER, PARAM_SPECS, type Category } from '../../../../webview/zzfx/params'

/** Bump whenever `buildZzfxPrompt`'s template changes — folded into the
 * cache key so a template change invalidates old cached responses. */
export const PROMPT_VERSION = 'zzfx-lm-v1'

export type Candidate = {
  label: string
  /** Positional zzfx args, length 8..21 (trailing defaults may be omitted). */
  params: number[]
  rationale: string
}

export type PresetEntry = {
  label: string
  params: number[]
}

// ─── Prompt template ───────────────────────────────────────────────────────

export type PromptOptions = {
  category: string
  styles: readonly string[]
  n: number
  seeds: readonly PresetEntry[]
}

/**
 * Builds the exact prompt from planning/vscode-tools/tool-zzfx-studio.md
 * §"AI generation", with `{N}`/`{category}`/`{adjectives}`/`{seed1}`/
 * `{seed2}` interpolated. vscode.lm's `LanguageModelChatMessage` has no
 * System role (only User/Assistant) — the "System:"/"User:" sections are
 * sent as literal text inside a single User message, per the doc's own
 * template shape.
 */
export function buildZzfxPrompt(options: PromptOptions): string {
  const { category, styles, n, seeds } = options
  const adjectives = styles.length > 0 ? styles.join(', ') : 'none'
  const seedLines =
    seeds.length > 0 ? seeds.map((s) => `  ${JSON.stringify(s.params)}`).join('\n') : '  (none)'
  return [
    'System:',
    'You are ZzFX-GPT. Output ONLY valid JSON matching:',
    '{ "candidates": [ { "label": string, "params": number[], "rationale": string } ] }',
    'Params are positional (length 8..21):',
    '  [volume(0..1), randomness(0..2), frequency(0..20000), attack(0..1),',
    '   sustain(0..1), release(0..1), shape(0..4 int),',
    '   shapeCurve(-1..3), slide(-9..9), deltaSlide(-1..1),',
    '   pitchJump(-1200..1200), pitchJumpTime(0..1), repeatTime(0..1),',
    '   noise(0..1), modulation(0..100), bitCrush(0..1), delay(0..1),',
    '   sustainVolume(0..1), decay(0..1), tremolo(0..1), filter(-2000..2000)]',
    'Rules:',
    '  - Trailing zeros may be omitted.',
    '  - shape MUST be an integer in 0..4.',
    `  - Output exactly ${n} candidates.`,
    '  - Never wrap output in code fences or prose.',
    '',
    'User:',
    `Generate ${n} variations of a "${category}" sound with style: ${adjectives}.`,
    'Example seeds:',
    seedLines,
  ].join('\n')
}

/** Corrective follow-up for the single retry after a response fails
 * `parseCandidates`. Echoes the failure reason so the model has a
 * concrete signal to correct. */
export function buildRetryPrompt(invalidResponse: string, reason: string): string {
  return [
    `Your previous response was not valid: ${reason}`,
    'Previous response was:',
    invalidResponse.slice(0, 500),
    '',
    'Respond again with ONLY the JSON object { "candidates": [...] } described above — no markdown, no prose, no code fences.',
  ].join('\n')
}

// ─── Response validation ───────────────────────────────────────────────────

export type ParseCandidatesResult =
  | { ok: true; candidates: Candidate[]; dropped: { index: number; reason: string }[] }
  | { ok: false; reason: string }

function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1]! : text
}

type CandidateValidation = { ok: true; candidate: Candidate } | { ok: false; reason: string }

/**
 * STRICT per the spec: params length 8..21, `shape` (index 6) an integer
 * 0..4, and — going further than the doc's headline three checks — EVERY
 * provided param validated against its real `PARAM_SPECS` range. Any
 * violation drops the whole candidate (no clamping, no partial credit —
 * unlike the webview's own slider input, an LM response that gets one
 * param wrong is treated as untrustworthy for all of them).
 */
function validateCandidate(raw: unknown): CandidateValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'candidate was not an object' }
  }
  const obj = raw as Record<string, unknown>

  const params = obj.params
  if (!Array.isArray(params)) {
    return { ok: false, reason: 'params was not an array' }
  }
  if (params.length < 8 || params.length > 21) {
    return { ok: false, reason: `params length ${params.length} out of range 8..21` }
  }
  if (!params.every((p): p is number => typeof p === 'number' && Number.isFinite(p))) {
    return { ok: false, reason: 'params contained a non-numeric or non-finite value' }
  }

  for (let i = 0; i < params.length; i++) {
    const key = PARAM_ORDER[i]
    if (!key) break
    const spec = PARAM_SPECS[key]
    const value = params[i]!
    if (value < spec.min || value > spec.max) {
      return {
        ok: false,
        reason: `${key} (index ${i}) value ${value} out of range ${spec.min}..${spec.max}`,
      }
    }
    if (key === 'shape' && !Number.isInteger(value)) {
      return { ok: false, reason: 'shape (index 6) must be an integer' }
    }
  }

  const label = typeof obj.label === 'string' && obj.label.trim() !== '' ? obj.label : 'Untitled'
  const rationale = typeof obj.rationale === 'string' ? obj.rationale : ''
  return { ok: true, candidate: { label, params: params as number[], rationale } }
}

/**
 * Parses + validates a raw LM text response into `{candidates: Candidate[]}`.
 * Strips a stray ```json fence (models wrap despite being told not to).
 * Per-candidate validation drops bad entries with a reason rather than
 * failing the whole response; only an unparseable payload, a missing/
 * non-array `candidates` field, or ZERO surviving candidates counts as
 * invalid (triggers the one retry in `runGeneration`).
 */
export function parseCandidates(text: string): ParseCandidatesResult {
  const stripped = stripCodeFence(text).trim()
  if (stripped === '') return { ok: false, reason: 'empty response' }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    return { ok: false, reason: 'response was not valid JSON' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'response was not a JSON object' }
  }
  const rawCandidates = (parsed as Record<string, unknown>).candidates
  if (!Array.isArray(rawCandidates)) {
    return { ok: false, reason: 'response did not contain a "candidates" array' }
  }

  const candidates: Candidate[] = []
  const dropped: { index: number; reason: string }[] = []
  rawCandidates.forEach((raw, index) => {
    const result = validateCandidate(raw)
    if (result.ok) candidates.push(result.candidate)
    else dropped.push({ index, reason: result.reason })
  })

  if (candidates.length === 0) {
    return { ok: false, reason: 'no valid candidates in response' }
  }
  return { ok: true, candidates, dropped }
}

// ─── Cache key ──────────────────────────────────────────────────────────────

export type CacheKeyOptions = {
  modelId: string
  promptVersion: string
  category: string
  styles: readonly string[]
  n: number
  hash: (text: string) => string
}

/**
 * `sha256(model.id, promptVersion, category, sortedAdjectives, N)` per
 * the spec — styles sorted first so selection ORDER never changes the
 * key (only the set of styles does). `hash` is injected (real sha256 in
 * `service.ts` via `node:crypto`, a trivial fake in tests) so this stays
 * environment-agnostic.
 */
export function cacheKeyFor(options: CacheKeyOptions): string {
  const { modelId, promptVersion, category, styles, n, hash } = options
  const sortedStyles = [...styles].sort()
  return hash(JSON.stringify([modelId, promptVersion, category, sortedStyles, n]))
}

// ─── Curated preset library ─────────────────────────────────────────────────

/**
 * ≥2 curated presets per category (all 12), full positional param arrays
 * validated against `PARAM_SPECS` in core.test.ts via `parseCandidates`
 * itself — a bad preset literally cannot ship without failing that test.
 * Serves TWO roles: (1) the `{seed1}`/`{seed2}` examples in the generate
 * prompt, and (2) the standalone preset library the webview renders when
 * `ZzfxInitPayload.lmAvailable` is false (no vscode.lm in this editor
 * host at all — see service.ts's `isAvailable()`) or when live generation
 * exhausts its one retry.
 */
export const PRESET_LIBRARY: Readonly<Record<Category, readonly PresetEntry[]>> = {
  Pickup: [
    { label: 'Coin Chime', params: [0.5, 0, 538, 0, 0.05, 0.15, 0, 1, 0, 0, 200, 0.05] },
    { label: 'Soft Ding', params: [0.4, 0.02, 800, 0, 0.03, 0.1, 0, 1.5] },
  ],
  Laser: [
    { label: 'Zap', params: [0.5, 0, 1200, 0, 0.02, 0.1, 2, 1, -6] },
    { label: 'Pew', params: [0.45, 0.05, 900, 0, 0.015, 0.08, 3, 1, -9] },
  ],
  Explosion: [
    {
      label: 'Boom',
      params: [0.6, 0.2, 80, 0, 0.1, 0.4, 4, 1, 0, 0, 0, 0, 0, 0.3, 0, 0.2, 0, 1, 0, 0, -800],
    },
    {
      label: 'Distant Rumble',
      params: [0.5, 0.3, 60, 0, 0.15, 0.5, 4, 1, 0, 0, 0, 0, 0, 0.4, 0, 0.1, 0, 1, 0, 0, -1200],
    },
  ],
  Powerup: [
    { label: 'Level Up', params: [0.55, 0, 200, 0, 0.15, 0.2, 1, 1, 8, 0, 400, 0.1] },
    { label: 'Charge Up', params: [0.5, 0, 150, 0, 0.2, 0.15, 1, 1, 9] },
  ],
  Hit: [
    { label: 'Punch', params: [0.5, 0, 150, 0, 0.02, 0.08, 3, 1, 0, 0, 0, 0, 0, 0.05] },
    { label: 'Crack', params: [0.45, 0.1, 200, 0, 0.015, 0.06, 3, 1] },
  ],
  Jump: [
    { label: 'Boing', params: [0.4, 0, 300, 0, 0.03, 0.08, 0, 1, 4] },
    { label: 'Hop', params: [0.35, 0.02, 350, 0, 0.02, 0.06, 0, 1, 3] },
  ],
  Blip: [
    { label: 'Tick', params: [0.3, 0, 900, 0, 0.02, 0.03, 0, 1] },
    { label: 'Tock', params: [0.28, 0, 700, 0, 0.015, 0.025, 1, 1] },
  ],
  'UI Click': [
    { label: 'Snap', params: [0.4, 0, 1200, 0, 0.005, 0.02, 1, 1] },
    { label: 'Tap', params: [0.35, 0, 1000, 0, 0.004, 0.015, 0, 1] },
  ],
  Footstep: [
    { label: 'Thud', params: [0.3, 0, 120, 0, 0.02, 0.05, 4, 1, 0, 0, 0, 0, 0, 0.2] },
    { label: 'Scuff', params: [0.28, 0.05, 100, 0, 0.015, 0.04, 4, 1, 0, 0, 0, 0, 0, 0.15] },
  ],
  Door: [
    { label: 'Creak', params: [0.4, 0, 200, 0.05, 0.1, 0.2, 3, 1, -1, 0, 0, 0, 0, 0, 5] },
    { label: 'Slam', params: [0.5, 0, 150, 0, 0.03, 0.15, 4, 1, 0, 0, 0, 0, 0, 0.15] },
  ],
  Alarm: [
    {
      label: 'Siren',
      params: [0.5, 0, 700, 0, 0.15, 0.1, 1, 1, 0, 0, 0, 0, 0.25, 0, 0, 0, 0, 1, 0, 0.3],
    },
    { label: 'Beep Beep', params: [0.45, 0, 900, 0, 0.1, 0.08, 1, 1, 0, 0, 0, 0, 0.2] },
  ],
  Heartbeat: [
    { label: 'Thump', params: [0.6, 0, 60, 0, 0.08, 0.15, 0, 1, 0, 0, 0, 0, 0.4] },
    { label: 'Pulse', params: [0.55, 0, 70, 0, 0.07, 0.12, 0, 1, 0, 0, 0, 0, 0.35] },
  ],
}

function libraryFor(category: string): readonly PresetEntry[] {
  return PRESET_LIBRARY[category as Category] ?? PRESET_LIBRARY.Blip
}

function presetCandidates(category: string): Candidate[] {
  return libraryFor(category).map((entry) => ({
    label: entry.label,
    params: entry.params,
    rationale: 'Curated preset (AI unavailable).',
  }))
}

// ─── Orchestration ──────────────────────────────────────────────────────────

export type LmSend = (prompt: string, onChunk?: (chunk: string) => void) => Promise<string | null>

export type CacheStore = {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
}

export type GenerateOptions = {
  category: string
  styles: readonly string[]
  n: number
  /** Opaque model identifier for the cache key — `'none'` when no model
   * was selected (that path's `send` always returns null, so it never
   * reaches a cache WRITE; a wasted cache READ under that key is harmless). */
  modelId: string
  send: LmSend
  cache: CacheStore
  hash: (text: string) => string
  onChunk?: (chunk: string) => void
}

export type GenerateSource = 'cache' | 'lm' | 'preset'

export type GenerateOutcome = {
  source: GenerateSource
  candidates: Candidate[]
  /** Candidates the model returned but that failed validation — only
   * populated for `source: 'lm'`. */
  dropped?: { index: number; reason: string }[]
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
  send: LmSend,
  prompt: string,
  onChunk?: (chunk: string) => void
): Promise<string | null> {
  try {
    return await send(prompt, onChunk)
  } catch {
    return null
  }
}

/**
 * The full decision tree: cache → LM (one retry on invalid response) →
 * curated preset. Every branch decision lives here, per the "thin
 * adapter" split with `service.ts` — `send`/`cache`/`hash` are the only
 * injected side effects.
 */
export async function runGeneration(options: GenerateOptions): Promise<GenerateOutcome> {
  const { category, styles, n, modelId, send, cache, hash, onChunk } = options
  const key = cacheKeyFor({ modelId, promptVersion: PROMPT_VERSION, category, styles, n, hash })

  const cached = await safeGet(cache, key)
  if (cached !== undefined) {
    const parsed = parseCandidates(cached)
    if (parsed.ok) return { source: 'cache', candidates: parsed.candidates }
    // Corrupt/stale cache entry (format changed, etc.) — fall through
    // and regenerate rather than failing the request.
  }

  const seeds = libraryFor(category).slice(0, 2)
  const prompt = buildZzfxPrompt({ category, styles, n, seeds })

  const raw = await safeSend(send, prompt, onChunk)
  if (raw === null) {
    return { source: 'preset', candidates: presetCandidates(category) }
  }

  let parsed = parseCandidates(raw)
  if (!parsed.ok) {
    const retryPrompt = buildRetryPrompt(raw, parsed.reason)
    const retryRaw = await safeSend(send, retryPrompt, onChunk)
    parsed =
      retryRaw === null ? { ok: false, reason: 'retry unavailable' } : parseCandidates(retryRaw)
  }

  if (!parsed.ok) {
    return { source: 'preset', candidates: presetCandidates(category) }
  }

  await safeSet(cache, key, JSON.stringify({ candidates: parsed.candidates }))
  return { source: 'lm', candidates: parsed.candidates, dropped: parsed.dropped }
}

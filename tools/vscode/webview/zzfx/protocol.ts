// Host <-> webview message contract for FL ZzFX Studio. See ./README.md
// for the full handshake writeup — this file is the type source of truth
// the CodeLens/host-wiring unit (#148 Z3) builds against. AI Generate
// shapes here match extension/tools/zzfx/lm/core.ts exactly — see that
// file + planning/vscode-tools/tool-zzfx-studio.md ("AI generation") for
// the canonical spec.

/** One AI-generated (or curated-preset) sound-effect candidate. */
export type ZzfxCandidate = {
  label: string
  /** Positional zzfx args, length 8..21. Run through `fromArgs` before use. */
  params: number[]
  rationale: string
}

/** host -> webview, sent in response to `zzfx/ready`. */
export type ZzfxInitPayload = {
  /** Stable id for the CodeLens finding this panel edits — echoed back on save. */
  findingId: string
  /** Document URI the finding lives in. */
  uri: string
  /** Positional zzfx args as found in source — may be shorter than 21
   * elements (trailing defaults omitted) or contain holes from a sparse
   * array literal. Run through `fromArgs` before use. */
  params: (number | null | undefined)[]
  /** Present when the finding is a named variable (`const sfx = zzfx(...)`)
   * rather than an inline call — informational, not required for saving. */
  varRef?: { name: string }
  /** Whether the host found an available `vscode.lm` chat model
   * (`ZzfxLmService.isAvailable()`) at panel-open time. `false` hides the
   * Generate button entirely — the webview falls back to browsing
   * `presets` for the selected category instead. */
  lmAvailable: boolean
  /** The full curated preset library (`extension/tools/zzfx/lm/core.ts`'s
   * `PRESET_LIBRARY`), keyed by category — sent once at init so the
   * preset-browsing fallback needs no round trip and works identically
   * whether or not `lmAvailable`. */
  presets: Record<string, { label: string; params: number[] }[]>
}

/** webview -> host, requests the init payload (register the `zzfx/init`
 * listener BEFORE calling this — see tools/bridge/CLAUDE.md handshake). */
export type ZzfxReadyResult = { ok: true }

/** webview -> host, writes the edited params back into source. */
export type ZzfxSavePayload = {
  findingId: string
  /** Canonical trailing-trimmed positional args — see `toArgs` in ./params.ts. */
  params: number[]
  /** Selected category pill (single-select), if any. */
  category?: string
  /** Selected style pills (multi-select, max 3), if any. */
  styles?: string[]
}

export type ZzfxSaveResult = { ok: true }

/** webview -> host, asks for `n` AI-generated candidates for the
 * currently selected category + styles. Only sent when `lmAvailable`
 * was true at init. Resolves with a plain ack — the actual candidates
 * arrive via the `zzfx/generateResult` push event below (which may
 * follow zero or more `zzfx/generateProgress` events), not as the
 * resolved value of this request, so the host can stream while this
 * promise stays pending. */
export type ZzfxGeneratePayload = {
  category: string
  styles: string[]
  n: number
}

export type ZzfxGenerateAck = { ok: true }

/** host -> webview, fired zero or more times while a `zzfx/generate`
 * request is in flight — one event per streamed text chunk from the
 * model. Never fired for a preset-sourced result (nothing to stream). */
export type ZzfxGenerateProgressEvent = {
  chunk: string
}

/** host -> webview, fired exactly once per `zzfx/generate` request,
 * after any progress events and before the request's own ack resolves. */
export type ZzfxGenerateResultEvent = {
  candidates: ZzfxCandidate[]
  /** Convenience flag exactly equal to `source === 'cache'`. */
  fromCache: boolean
  /** `'lm'` only for a live, validated model response; `'cache'` for a
   * previous `'lm'` result served from the sha256 cache; `'preset'`
   * whenever the model was unavailable, errored, or failed validation
   * twice. The webview surfaces this so "AI Generate" never silently
   * lies about having used AI. */
  source: 'lm' | 'cache' | 'preset'
}

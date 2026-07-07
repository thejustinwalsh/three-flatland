// Host <-> webview message contract for FL ZzFX Studio. See ./README.md
// for the full handshake writeup — this file is the type source of truth
// the CodeLens/host-wiring unit (#148 Z3) builds against.

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

/** webview -> host, asks the host to generate a param set via
 * `vscode.lm` (falling back to a curated preset — see
 * `extension/tools/zzfx/lmService.ts`) for the currently selected
 * category + styles. */
export type ZzfxGeneratePayload = {
  category?: string
  styles?: string[]
}

export type ZzfxGenerateResult = {
  ok: true
  /** Canonical trailing-trimmed positional args — see `toArgs` in ./params.ts. */
  params: number[]
  /** Where the params actually came from — `'lm'` only when a live
   * model call produced a validated result; `'cache'` for a previous
   * `'lm'` result served from the sha256 prompt cache; `'preset'`
   * whenever the model was unavailable, errored, or failed validation
   * twice. The webview surfaces this so "AI Generate" never silently
   * lies about having used AI. */
  source: 'lm' | 'preset' | 'cache'
}

/** host -> webview, fired zero or more times while a `zzfx/generate`
 * request is in flight — one event per streamed text chunk from the
 * model. Never fired for a `'preset'`-sourced result (nothing to
 * stream). Purely cosmetic — the authoritative result is the resolved
 * value of the `zzfx/generate` request itself. */
export type ZzfxGenerateProgressEvent = {
  chunk: string
}

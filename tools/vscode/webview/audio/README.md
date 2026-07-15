# FL ZzFX Studio — webview

Sound-effect editor for [zzfx](https://github.com/KilledByAPixel/ZzFX) params, surfaced via a CodeLens on `zzfx(...)` calls in source. **This directory is the webview only.** The CodeLens provider + host-side wiring (opening the panel, resolving the finding, writing the save back into source) is a separate unit — issue #148, sub-task Z3. This README is the contract that unit builds against.

Full tool spec, including the AI-generation prompt template verbatim: `planning/vscode-tools/tool-zzfx-studio.md`.

## Files

| File                                                                          | What                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params.ts`                                                                   | The 21-param model: `ParamKey`, `PARAM_SPECS` (label/default/min/max/step), `PARAM_GROUPS` (UI grouping), `defaultParams`/`clampParam`/`toArgs`/`fromArgs`/`fromPartial`. Also `CATEGORIES`/`STYLES`/`MAX_STYLES`.                                                                                                                       |
| `sliderMath.ts`                                                               | Pure drag math for `Slider.tsx` (`computeDragValue`, `snapToStep`, `ratioForValue`) — unit-tested without a DOM.                                                                                                                                                                                                                         |
| `protocol.ts`                                                                 | Bridge message types — `ZzfxInitPayload`, `ZzfxSavePayload`, `ZzfxGeneratePayload`/`ZzfxGenerateProgressEvent`/`ZzfxGenerateResultEvent`, `ZzfxCandidate`. Source of truth for the host-wiring unit.                                                                                                                                     |
| `audio.ts`                                                                    | Lazy zzfx playback + synthesis — dynamic-imports `zzfx`, resumes its `AudioContext` from inside a user-gesture handler, returns a `PlaybackHandle` (context/start/duration) for the waveform's playhead sweep. `synthesizeSamples` exposes `buildSamples` for the waveform preview without touching audio output.                        |
| `waveformPath.ts`                                                             | Pure min/max-per-pixel-bucket downsampling + peak normalization for the waveform preview — unit-tested in `waveformPath.test.ts`, no DOM.                                                                                                                                                                                                |
| `WaveformPreview.tsx`                                                         | The waveform strip above the params panel — DPR-aware canvas trace of the current params' `buildSamples` buffer, debounced ~100ms, gain/duration readout in the panel header, `AudioContext`-timed playhead sweep on toolbar Play (skipped under `prefers-reduced-motion`).                                                              |
| `zzfx.d.ts`                                                                   | Ambient module declaration — the `zzfx` npm package ships no `.d.ts`. Mirrors `minis/breakout/src/zzfx.d.ts`; keep in sync if the pinned version changes.                                                                                                                                                                                |
| `Slider.tsx`, `Pill.tsx`, `PillGroup.tsx`, `SourceLink.tsx`, `link.stylex.ts` | Locally-composed primitives (see "Local primitives" below).                                                                                                                                                                                                                                                                              |
| `ParamRow.tsx`, `ParamGroup.tsx`                                              | One param row (slider + NumberField, or a dropdown for `shape`); one collapsible group of rows.                                                                                                                                                                                                                                          |
| `AiGeneratePanel.tsx`                                                         | AI Generate UI — Generate button, live stream readout, N candidate cards (label/rationale/Play/"Use this"), source badge (`lm`/`cache`/`preset`). Falls back to a static preset-browsing card list when `lmAvailable` is false. Feature-flagged (`AI_GENERATE_ENABLED`, currently `true`) — a ship kill-switch. See "AI Generate" below. |
| `useZzfxSession.ts`                                                           | Bridge handshake + all editable state (params, dirty flag, category, styles, save, generate, candidates, presets).                                                                                                                                                                                                                       |
| `App.tsx`, `main.tsx`, `index.html`                                           | Standard tool boot — see `tools/vscode/CLAUDE.md`.                                                                                                                                                                                                                                                                                       |

## Bridge contract (`protocol.ts`)

Handshake follows the repo convention (`tools/bridge/CLAUDE.md`): the webview registers its `zzfx/init` listener before requesting `zzfx/ready`.

```
Webview (on mount):
  bridge.on('zzfx/init', (p: ZzfxInitPayload) => { ...load params... })
  bridge.request('zzfx/ready')

Host (in 'zzfx/ready' handler):
  bridge.emit('zzfx/init', { findingId, uri, params, varRef?, lmAvailable, presets })
  return { ok: true }
```

```ts
// host -> webview, in response to zzfx/ready
type ZzfxInitPayload = {
  findingId: string // stable id for the CodeLens finding — echo back on save
  uri: string // document URI the finding lives in
  sourcePath: string // workspace-relative path of `uri` — header source-link display only
  sourceLine: number // 0-based CALL-SITE start line at open time (display 1-based);
  // the call the user opened from even for a var-ref finding — a snapshot,
  // like the panel title; zzfx/revealSource re-resolves the live position
  def?: { path: string; line: number } // DECLARATION location for a var-ref with a
  // readable initializer (workspace-relative path + 0-based initializer start line).
  // Present ⇒ the header link shows the variable name alone with this location in its
  // tooltip (the panel tab already shows the call-site file:line — don't duplicate it);
  // absent ⇒ the link falls back to call-site `basename:line`
  params: (number | null | undefined)[] // positional zzfx args as found in source; may be
  // short (trailing defaults omitted) or have holes from a
  // sparse array literal — run through params.ts's fromArgs()
  varRef?: { name: string } // present for `const sfx = zzfx(...)`; informational only
  lmAvailable: boolean // ZzfxLmService.isAvailable() at panel-open time — see "AI Generate" below
  presets: Record<string, { label: string; params: number[] }[]> // extension/tools/audio/lm/core.ts's PRESET_LIBRARY, verbatim
}

// webview -> host
type ZzfxSavePayload = {
  findingId: string
  params: number[] // canonical trailing-trimmed args — params.ts's toArgs()
  category?: string // selected category pill (single-select)
  styles?: string[] // selected style pills (multi-select, max 3)
}
type ZzfxSaveResult = { ok: true }
```

`zzfx/ready` resolves with `{ ok: true }`. `zzfx/save` throwing on the host side rejects the webview's `save()` promise — `useZzfxSession` surfaces the message as `saveError`, rendered as a banner in `App.tsx`. A successful save clears `dirty`.

### Playback volume trim (`playbackVolume` + `zzfx/config`)

The `threeFlatland.audio.playbackVolume` setting is a dB trim (±12, default 0 = today's exact baseline loudness). The HOST resolves it to a linear gain multiplier through `volumeTrim.ts`'s `trimToMultiplier` — the SAME mapping the inline sidecar route reads per play (`extension/tools/audio/playbackVolume.ts` → audio-play's `volume` command field), so the panel and the no-panel route always sound identical for the same setting. The webview receives the multiplier in `ZzfxInitPayload.playbackVolume` and live updates via the `zzfx/config { playbackVolume }` push; `App.tsx` wires it into `audio.ts`'s `setPlaybackVolume`, which scales `ZZFX.volume` against its once-captured baseline right before each play (never against the current value — that would compound the trim). Waveform synthesis (`buildSamples`) is pre-gain and deliberately unaffected, matching the sidecar where the trim applies at the output gain node.

### Reveal source (`zzfx/revealSource`)

```ts
// webview -> host — the header source link's click. Empty payload; the
// host already knows the finding.
type ZzfxRevealSourcePayload = Record<string, never> // {}
type ZzfxRevealSourceResult = { ok: true }
```

The host re-resolves the finding's **current** position by id (the same fresh re-parse the save path starts from) and calls `showTextDocument` — without `preserveFocus`, so the revealed editor takes focus (the link's whole job is "take me there", unlike the play routes). Target selection mirrors what Save writes to: a var-ref with a readable declaration reveals the **declaration** with the initializer selected; everything else reveals the **call site** with the call selected. If the finding is gone — edited away since the panel opened — it falls back to opening the open-time target file at the open-time line, cursor-collapsed and clamped (a stale range could select the wrong text), with **no error toast**: a stale-ish reveal beats an error for a navigation click. The webview side is fire-and-forget for the same reason.

### AI candidate history (`zzfx/history/*`) — Z14

"We pay good money for these" — generated candidates must survive the webview's lifecycle (panel moves, close/reopen, window restarts). Durability is **host-owned**: a JSON blob at `<globalStorageUri>/zzfx-lm-history.json` (sibling to the LM cache, reusing its memoized-loader + read-merge-write patterns — see `extension/tools/audio/history/{core,store}.ts`; the stakeholder's "should at least be using local storage" was the floor, and host storage survives all of the above by construction).

- **Keyed to the source identity the header link shows**: variable case → `defUri` + variable name (the history follows the SOUND, across call-site edits); literal case → `uri` + open-time line (tolerant: if the line drifts, old entries just stop showing — the key is identity, not a live pointer).
- **Grow, never replace**: each `lm`/`cache` generate APPENDS a `ZzfxHistoryBatch` `{ts, category, styles, source, candidates}`, persisted host-side at the same moment `zzfx/generateResult` is emitted. **Preset results are never persisted** (free + deterministic — they'd only dilute the paid-for history). Capped at the newest `HISTORY_MAX_BATCHES_PER_SOURCE` (10) batches per source, oldest pruned on append.
- **Flow**: `ZzfxInitPayload.history` carries the source's batches (newest-first); every change pushes `zzfx/historyChanged { history }` as a full replacement — the webview renders, never owns, durability. Webview → host: `zzfx/history/delete { batchTs, index }` (per-candidate trash button) and `zzfx/history/clear {}` (panel-header clear-all behind an inline two-step confirm; the armed state auto-disarms after 3s).
- The panel renders history in BOTH branches (`lmAvailable` and the preset browser) — sounds generated while a model was signed in must not vanish on sign-out. An `lm`/`cache` generate result appears as the newest history batch; only the never-persisted preset fallback still renders as a transient labeled result.

### Standalone / dev mode

If `acquireVsCodeApi()` isn't available (e.g. `pnpm --filter @three-flatland/vscode dev:webview` opened directly in a browser, outside the extension host), `useZzfxSession` catches the throw from `createClientBridge()` and sets `standalone: true`. In that mode:

- Params stay at `defaultParams()` — no `zzfx/init` ever arrives, so `lmAvailable` stays `false` and `presets` stays `{}`. `AiGeneratePanel` therefore renders its preset-browser branch (no Generate button to disable) — with an empty `presets` map, that browser just shows nothing to pick, which is expected: there's no host to source presets from.
- The **Save** toolbar button is disabled (`session.standalone` guards it in `App.tsx`).
- **Play still works** — `audio.ts` only touches the Web Audio API, never the bridge — including for any candidate/preset card that does render.

This is the "guard the bridge" requirement — every bridge touch in this webview goes through `useZzfxSession`, which is the single try/catch boundary.

## Param round-trip (`params.ts`)

`toArgs`/`fromArgs` are the canonicalization pair for the `number[]` the bridge and source code exchange; `fromPartial` is the keyed-object counterpart used by the AI Generate path (see below):

- `fromArgs(args)` — inverse of `toArgs`. Missing trailing elements (array shorter than 21) or `null`/`undefined` holes fill in from `PARAM_SPECS[key].default`, then every value is clamped via `clampParam`.
- `toArgs(params)` — full 21-value positional array with the **trailing** run of default-valued params trimmed (right-to-left), matching zzfx's own sparse-array convention (`zzfx(...[,,,,.1,,,,9])`). Only trailing defaults trim; a default sitting before a later non-default param stays dense (the result is always a plain `number[]`, never a sparse array with holes).
- `toDenseArgs(params)` — same values, no trimming; used by `audio.ts` for playback where zzfx just needs all 21 positions.
- `fromPartial(partial)` — fills a `{ paramKey: value }` object (only some keys, e.g. from an AI-generated candidate's `params` array re-keyed by position) with defaults for every omitted key, clamped.

Round-trip: `fromArgs(toArgs(params))` reproduces `params` (up to `clampParam`'s clamping/rounding). Covered in `params.test.ts`.

## AI Generate (`zzfx/generate`) — #148 Z5

Both halves are fully implemented and unit-tested — **but nothing wires `bridge.on('zzfx/generate', ...)` into a live panel yet**, because there is no live panel until Z3 lands. That wiring is Z3's job; everything it needs is described here. Spec source of truth (prompt template verbatim, validation rules, cache-key formula): `planning/vscode-tools/tool-zzfx-studio.md`'s "AI generation" section.

```ts
// webview -> host — resolves with a plain ack; candidates arrive via the push event below
type ZzfxGeneratePayload = { category: string; styles: string[]; n: number }
type ZzfxGenerateAck = { ok: true }

// host -> webview, zero or more times while a request is in flight
type ZzfxGenerateProgressEvent = { chunk: string }

// host -> webview, exactly once per request, after any progress events
type ZzfxGenerateResultEvent = {
  candidates: ZzfxCandidate[] // { label, params: number[] (length 8..21), rationale }
  fromCache: boolean // exactly `source === 'cache'`
  source: 'lm' | 'cache' | 'preset'
}
```

`zzfx/generate`'s own resolved value is just an ack (`{ ok: true }`) — the host handler awaits the FULL generation (including any retry) before returning, so `onChunk`-driven `zzfx/generateProgress` events fire during that await and `zzfx/generateResult` fires right before the handler returns. This lets streaming work with the existing request/response bridge primitive without needing a new one.

`source` is not cosmetic — the webview shows a different confirmation string per source (`AiGeneratePanel.tsx`'s `sourceLabel`) and, when `lmAvailable` was false at init, skips the request path entirely and renders `presets[category]` as a static card list instead — so "AI Generate" never silently claims to have used AI when it didn't.

### What Z3 needs to add to its `host.ts`

```ts
import { ZzfxLmService } from './lm/service'

const lmService = new ZzfxLmService(context) // context: vscode.ExtensionContext

// at panel init:
bridge.emit('zzfx/init', {
  findingId,
  uri,
  params,
  varRef,
  lmAvailable: await lmService.isAvailable(),
  presets: PRESET_LIBRARY, // import { PRESET_LIBRARY } from './lm/core'
})

// generate handler:
bridge.on<ZzfxGeneratePayload>('zzfx/generate', async ({ category, styles, n }) => {
  const outcome = await lmService.generate({ category, styles, n }, (chunk) =>
    bridge.emit('zzfx/generateProgress', { chunk })
  )
  bridge.emit('zzfx/generateResult', {
    candidates: outcome.candidates,
    fromCache: outcome.source === 'cache',
    source: outcome.source,
  })
  return { ok: true }
})
```

That's the entire integration surface — `ZzfxLmService` (and the `runGeneration` orchestrator it wraps, in `extension/tools/audio/lm/core.ts`) owns the whole cache → LM → retry → preset-fallback state machine; the host handler is just plumbing + re-shaping the event names.

### `ZzfxLmService` API surface (`extension/tools/audio/lm/service.ts`)

```ts
class ZzfxLmService {
  constructor(context: vscode.ExtensionContext)

  /** Probes vscode.lm for an available `copilot`-vendor chat model. Cheap
   * — call once per panel-open to compute ZzfxInitPayload.lmAvailable. */
  isAvailable(): Promise<boolean>

  /** Generates `n` candidates for category/styles, degrading through
   * cache -> live model (one retry) -> curated preset. `onChunk` fires
   * once per streamed text fragment from a live model call. */
  generate(
    args: { category: string; styles: readonly string[]; n: number },
    onChunk?: (chunk: string) => void
  ): Promise<{
    source: 'cache' | 'lm' | 'preset'
    candidates: { label: string; params: number[]; rationale: string }[]
    dropped?: { index: number; reason: string }[] // only for source: 'lm'
  }>
}
```

### How the pieces fit (`extension/tools/audio/lm/`)

| File         | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Unit-tested?                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core.ts`    | ALL the decisions, zero `vscode` import: `buildZzfxPrompt`/`buildRetryPrompt` (prompt text, built from `PARAM_SPECS`/`PARAM_ORDER` imported from `../../../../webview/audio/params.ts` so the described schema can never drift from the real clamp ranges), `parseCandidates` (strict per-candidate validation — params length 8..21, `shape` an integer 0..4, every param within its real `PARAM_SPECS` range; drops bad candidates individually, only fails the whole response on unparseable JSON or zero survivors), `cacheKeyFor` (`sha256(modelId, promptVersion, category, sortedStyles, n)`), `PRESET_LIBRARY` (≥2 curated presets per category, all 12), `runGeneration` (the cache → LM → one retry → preset orchestrator, dependency-injected on `send`/`cache`/`hash`). | Yes — `core.test.ts`, 32 cases: prompt interpolation, every `parseCandidates` failure mode (garbage, missing-field, out-of-range, non-integer shape, zero-survivors), cache-key stability + styles-order invariance, full `PRESET_LIBRARY` validity (run through `parseCandidates` itself — a bad preset cannot ship), and the full `runGeneration` state machine. |
| `service.ts` | `ZzfxLmService` — thin real implementations of `core.ts`'s injected interfaces: `vscode.lm.selectChatModels({vendor:'copilot'})` + `sendRequest` + streaming (20s timeout via `CancellationTokenSource`), a JSON-blob cache at `<globalStorageUri>/zzfx-lm-cache.json` (capped 200 entries), `node:crypto` sha256.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | No — real `vscode`/fs/crypto glue, same precedent as `webview/audio/audio.ts`'s untested `AudioContext` boundary. Verify manually once Z3 wires it into a live panel.                                                                                                                                                                                              |

### Retry + cache + fallback behavior

1. `cacheKeyFor(...)` hit → `source: 'cache'`, model never called.
2. Live call, response validates → `source: 'lm'`, canonical `{candidates}` JSON cached under that key for next time.
3. Response fails `parseCandidates` (unparseable / missing `candidates` array / zero surviving candidates after per-candidate validation) → **one** corrective retry with a follow-up prompt that echoes the failure reason.
4. Model unavailable (no `copilot`-vendor model selected, consent declined, timeout, any error), or still invalid after the retry → `PRESET_LIBRARY[category]` (or `Blip`'s if the category is unrecognized), `source: 'preset'`. **Never cached** — caching a preset would block a retry once the model becomes available.

Two layers of degradation, matching the planning doc's Risks section ("LM API instability — feature-flag the Generate panel; degrade to presets"):

- **Panel-level, static**: `ZzfxInitPayload.lmAvailable` (from `isAvailable()`) decides whether the webview shows the Generate button at all, or renders the preset browser instead. `vscode.lm` genuinely may not exist in every editor host this extension targets (its `package.json` description lists VSCode, Cursor, Antigravity), and even where it exists, no `copilot`-vendor model may be signed in.
- **Request-level, dynamic**: even when `lmAvailable` was true at init, a single flaky `generate()` call still degrades to the preset library on exhausted retries rather than surfacing an error.

## Slider ("scrub") interaction

`Slider.tsx` is a horizontal scrub control — same convention as the design-system `NumberField`'s vertical drag handle: dragging offsets the value that was current when the drag started by the pointer's _displacement since then_, it does not jump to the pointer's absolute track position. The math (`sliderMath.ts`) always recomputes from the ORIGINAL `pointerdown` snapshot on every `pointermove`, never chaining off the previous move's (possibly step-rounded) result — see the regression-guard test in `sliderMath.test.ts` for why that distinction matters once step-snapping is involved.

## Local primitives (candidates for `@three-flatland/design-system` promotion)

Nothing in the design system covers a pill/chip toggle or a horizontal scrub slider, so both were composed locally per `tools/vscode/CLAUDE.md`'s "compose locally, note as a promotion candidate" allowance:

- **`Pill`** (`Pill.tsx`) — toggleable chip, `active`/`disabled`/`onToggle` props, styled with `vscode.*` tokens. `PillGroup.tsx` layers single-select and multi-select-with-max on top.
- **`Slider`** (`Slider.tsx`) — horizontal scrub control described above.
- **`SourceLink`** (`SourceLink.tsx`) — text link in VS Code's `textLink` colors (mono, hover underline) for the header's source location. Its colors come from `link.stylex.ts`, a local `defineVars` bridge for `--vscode-textLink-*` — the design system's `vscode-theme.stylex` has no link tokens yet; both are promotion candidates together.

If a future tool needs either, promote them into `tools/design-system/src/primitives/` following that package's "Adding a primitive" steps.

## Play without opening the editor (`zzfx/play`) — #148 Z3

The CodeLens `▶ Play` / `FL: Play ZzFX at Cursor` route needs to make a
sound without requiring the user to first click into the sliders panel.
Since the extension host has no Web Audio API of its own, it still needs
_a_ webview to own the `AudioContext` — so `host.ts` opens or reuses this
same editor panel (`preserveFocus: true`, so the source editor keeps
focus) and pushes a `zzfx/play` event once the panel's ready handshake has
resolved:

```ts
// host -> webview, at any time after zzfx/ready — decoupled from
// findingId/dirty/the loaded params entirely
type ZzfxPlayEvent = { params: (number | null | undefined)[] }
```

`useZzfxSession` listens for it and exposes `playRequest` (the latest
event, tagged with a local monotonic `requestId` so replaying the same
sound twice still re-fires); `App.tsx` reacts to `playRequest` by calling
the exact same `playParams`/`playError` path the toolbar ▶ Play button
uses. This is the **one** additive touch authorized against this
otherwise-frozen webview — `protocol.ts` (this type), `useZzfxSession.ts`
(the listener + `playRequest` state), `App.tsx` (a small effect wiring
`playRequest` into the existing play/error path), and this README section.
Nothing else in this directory changed for it.

**Autoplay-policy honesty**: a `zzfx/play` event arriving via
`postMessage` did not originate from a click inside this webview's own
document, so it does not satisfy the browser's "user gesture" requirement
for `AudioContext.resume()` the same way clicking the toolbar button does.
When VS Code's webview host blocks it, the attempt fails and surfaces
through the same error banner the toolbar button uses, worded to point at
that button as the fallback — this deliberately does **not** pretend the
sound played when it didn't. Whether a given VS Code build's webview host
actually enforces this restriction (Electron's autoplay policy differs
from a stricter web browser's) isn't asserted either way here; both
outcomes are handled correctly.

## Playback autoplay-policy note

`zzfx` constructs its own `AudioContext` as a module-level side effect. `audio.ts` dynamic-imports the package (deferring that construction) from inside the Play button's click handler and explicitly `resume()`s the context if it's `suspended` before playing — see the comment in `audio.ts` for the full reasoning. No automated test covers this file: it requires a real `AudioContext`/user gesture, which isn't available under the repo's `environment: 'node'` vitest config (consistent with how `minis/breakout`'s zzfx usage is untested too). Verify manually via `pnpm --filter @three-flatland/vscode dev:webview` + opening `dist/webview/audio/index.html`'s dev URL, or through the built extension once Z3 wires up the CodeLens.

## CSP note for the host-wiring unit

This webview only plays audio today — no file I/O. When WAV export lands (mentioned in issue #148 but not part of this unit), the host's `composeToolHtml` CSP for this panel will need `media-src ${cspSource} blob:` in addition to whatever it already sets, so an exported `Blob` can be played back / downloaded from within the webview.

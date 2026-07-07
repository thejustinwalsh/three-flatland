# FL ZzFX Studio — webview

Sound-effect editor for [zzfx](https://github.com/KilledByAPixel/ZzFX) params, surfaced via a CodeLens on `zzfx(...)` calls in source. **This directory is the webview only.** The CodeLens provider + host-side wiring (opening the panel, resolving the finding, writing the save back into source) is a separate unit — issue #148, sub-task Z3. This README is the contract that unit builds against.

Full tool spec, including the AI-generation prompt template verbatim: `planning/vscode-tools/tool-zzfx-studio.md`.

## Files

| File                                      | What                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params.ts`                               | The 21-param model: `ParamKey`, `PARAM_SPECS` (label/default/min/max/step), `PARAM_GROUPS` (UI grouping), `defaultParams`/`clampParam`/`toArgs`/`fromArgs`/`fromPartial`. Also `CATEGORIES`/`STYLES`/`MAX_STYLES`.                                                                                                                       |
| `sliderMath.ts`                           | Pure drag math for `Slider.tsx` (`computeDragValue`, `snapToStep`, `ratioForValue`) — unit-tested without a DOM.                                                                                                                                                                                                                         |
| `protocol.ts`                             | Bridge message types — `ZzfxInitPayload`, `ZzfxSavePayload`, `ZzfxGeneratePayload`/`ZzfxGenerateProgressEvent`/`ZzfxGenerateResultEvent`, `ZzfxCandidate`. Source of truth for the host-wiring unit.                                                                                                                                     |
| `audio.ts`                                | Lazy zzfx playback — dynamic-imports `zzfx` and resumes its `AudioContext` from inside a user-gesture handler.                                                                                                                                                                                                                           |
| `zzfx.d.ts`                               | Ambient module declaration — the `zzfx` npm package ships no `.d.ts`. Mirrors `minis/breakout/src/zzfx.d.ts`; keep in sync if the pinned version changes.                                                                                                                                                                                |
| `Slider.tsx`, `Pill.tsx`, `PillGroup.tsx` | Locally-composed primitives (see "Local primitives" below).                                                                                                                                                                                                                                                                              |
| `ParamRow.tsx`, `ParamGroup.tsx`          | One param row (slider + NumberField, or a dropdown for `shape`); one collapsible group of rows.                                                                                                                                                                                                                                          |
| `AiGeneratePanel.tsx`                     | AI Generate UI — Generate button, live stream readout, N candidate cards (label/rationale/Play/"Use this"), source badge (`lm`/`cache`/`preset`). Falls back to a static preset-browsing card list when `lmAvailable` is false. Feature-flagged (`AI_GENERATE_ENABLED`, currently `true`) — a ship kill-switch. See "AI Generate" below. |
| `useZzfxSession.ts`                       | Bridge handshake + all editable state (params, dirty flag, category, styles, save, generate, candidates, presets).                                                                                                                                                                                                                       |
| `App.tsx`, `main.tsx`, `index.html`       | Standard tool boot — see `tools/vscode/CLAUDE.md`.                                                                                                                                                                                                                                                                                       |

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
  params: (number | null | undefined)[] // positional zzfx args as found in source; may be
  // short (trailing defaults omitted) or have holes from a
  // sparse array literal — run through params.ts's fromArgs()
  varRef?: { name: string } // present for `const sfx = zzfx(...)`; informational only
  lmAvailable: boolean // ZzfxLmService.isAvailable() at panel-open time — see "AI Generate" below
  presets: Record<string, { label: string; params: number[] }[]> // extension/tools/zzfx/lm/core.ts's PRESET_LIBRARY, verbatim
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

That's the entire integration surface — `ZzfxLmService` (and the `runGeneration` orchestrator it wraps, in `extension/tools/zzfx/lm/core.ts`) owns the whole cache → LM → retry → preset-fallback state machine; the host handler is just plumbing + re-shaping the event names.

### `ZzfxLmService` API surface (`extension/tools/zzfx/lm/service.ts`)

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

### How the pieces fit (`extension/tools/zzfx/lm/`)

| File         | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Unit-tested?                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core.ts`    | ALL the decisions, zero `vscode` import: `buildZzfxPrompt`/`buildRetryPrompt` (prompt text, built from `PARAM_SPECS`/`PARAM_ORDER` imported from `../../../../webview/zzfx/params.ts` so the described schema can never drift from the real clamp ranges), `parseCandidates` (strict per-candidate validation — params length 8..21, `shape` an integer 0..4, every param within its real `PARAM_SPECS` range; drops bad candidates individually, only fails the whole response on unparseable JSON or zero survivors), `cacheKeyFor` (`sha256(modelId, promptVersion, category, sortedStyles, n)`), `PRESET_LIBRARY` (≥2 curated presets per category, all 12), `runGeneration` (the cache → LM → one retry → preset orchestrator, dependency-injected on `send`/`cache`/`hash`). | Yes — `core.test.ts`, 32 cases: prompt interpolation, every `parseCandidates` failure mode (garbage, missing-field, out-of-range, non-integer shape, zero-survivors), cache-key stability + styles-order invariance, full `PRESET_LIBRARY` validity (run through `parseCandidates` itself — a bad preset cannot ship), and the full `runGeneration` state machine. |
| `service.ts` | `ZzfxLmService` — thin real implementations of `core.ts`'s injected interfaces: `vscode.lm.selectChatModels({vendor:'copilot'})` + `sendRequest` + streaming (20s timeout via `CancellationTokenSource`), a JSON-blob cache at `<globalStorageUri>/zzfx-lm-cache.json` (capped 200 entries), `node:crypto` sha256.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | No — real `vscode`/fs/crypto glue, same precedent as `webview/zzfx/audio.ts`'s untested `AudioContext` boundary. Verify manually once Z3 wires it into a live panel.                                                                                                                                                                                               |

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

If a future tool needs either, promote them into `tools/design-system/src/primitives/` following that package's "Adding a primitive" steps.

## Playback autoplay-policy note

`zzfx` constructs its own `AudioContext` as a module-level side effect. `audio.ts` dynamic-imports the package (deferring that construction) from inside the Play button's click handler and explicitly `resume()`s the context if it's `suspended` before playing — see the comment in `audio.ts` for the full reasoning. No automated test covers this file: it requires a real `AudioContext`/user gesture, which isn't available under the repo's `environment: 'node'` vitest config (consistent with how `minis/breakout`'s zzfx usage is untested too). Verify manually via `pnpm --filter @three-flatland/vscode dev:webview` + opening `dist/webview/zzfx/index.html`'s dev URL, or through the built extension once Z3 wires up the CodeLens.

## CSP note for the host-wiring unit

This webview only plays audio today — no file I/O. When WAV export lands (mentioned in issue #148 but not part of this unit), the host's `composeToolHtml` CSP for this panel will need `media-src ${cspSource} blob:` in addition to whatever it already sets, so an exported `Blob` can be played back / downloaded from within the webview.

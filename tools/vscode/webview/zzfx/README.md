# FL ZzFX Studio — webview

Sound-effect editor for [zzfx](https://github.com/KilledByAPixel/ZzFX) params, surfaced via a CodeLens on `zzfx(...)` calls in source. **This directory is the webview only.** The CodeLens provider + host-side wiring (opening the panel, resolving the finding, writing the save back into source) is a separate unit — issue #148, sub-task Z3. This README is the contract that unit builds against.

## Files

| File                                      | What                                                                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params.ts`                               | The 21-param model: `ParamKey`, `PARAM_SPECS` (label/default/min/max/step), `PARAM_GROUPS` (UI grouping), `defaultParams`/`clampParam`/`toArgs`/`fromArgs`. Also `CATEGORIES`/`STYLES`/`MAX_STYLES`.                                               |
| `sliderMath.ts`                           | Pure drag math for `Slider.tsx` (`computeDragValue`, `snapToStep`, `ratioForValue`) — unit-tested without a DOM.                                                                                                                                   |
| `protocol.ts`                             | Bridge message types — `ZzfxInitPayload`, `ZzfxSavePayload`, `ZzfxGeneratePayload`/`ZzfxGenerateResult`/`ZzfxGenerateProgressEvent`, result types. Source of truth for the host-wiring unit.                                                       |
| `audio.ts`                                | Lazy zzfx playback — dynamic-imports `zzfx` and resumes its `AudioContext` from inside a user-gesture handler.                                                                                                                                     |
| `zzfx.d.ts`                               | Ambient module declaration — the `zzfx` npm package ships no `.d.ts`. Mirrors `minis/breakout/src/zzfx.d.ts`; keep in sync if the pinned version changes.                                                                                          |
| `Slider.tsx`, `Pill.tsx`, `PillGroup.tsx` | Locally-composed primitives (see "Local primitives" below).                                                                                                                                                                                        |
| `ParamRow.tsx`, `ParamGroup.tsx`          | One param row (slider + NumberField, or a dropdown for `shape`); one collapsible group of rows.                                                                                                                                                    |
| `AiGeneratePanel.tsx`                     | AI Generate UI — Generate button, live stream readout, source badge (`lm`/`cache`/`preset`). Feature-flagged (`AI_GENERATE_ENABLED`, currently `true`) — a ship kill-switch, not a "not implemented" placeholder anymore. See "AI Generate" below. |
| `useZzfxSession.ts`                       | Bridge handshake + all editable state (params, category, styles, save, generate).                                                                                                                                                                  |
| `App.tsx`, `main.tsx`, `index.html`       | Standard tool boot — see `tools/vscode/CLAUDE.md`.                                                                                                                                                                                                 |

## Bridge contract (`protocol.ts`)

Handshake follows the repo convention (`tools/bridge/CLAUDE.md`): the webview registers its `zzfx/init` listener before requesting `zzfx/ready`.

```
Webview (on mount):
  bridge.on('zzfx/init', (p: ZzfxInitPayload) => { ...load params... })
  bridge.request('zzfx/ready')

Host (in 'zzfx/ready' handler):
  bridge.emit('zzfx/init', { findingId, uri, params, varRef? })
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

`zzfx/ready` resolves with `{ ok: true }`. `zzfx/save` throwing on the host side rejects the webview's `save()` promise — `useZzfxSession` surfaces the message as `saveError`, rendered as a banner in `App.tsx`.

### Standalone / dev mode

If `acquireVsCodeApi()` isn't available (e.g. `pnpm --filter @three-flatland/vscode dev:webview` opened directly in a browser, outside the extension host), `useZzfxSession` catches the throw from `createClientBridge()` and sets `standalone: true`. In that mode:

- Params stay at `defaultParams()` — no `zzfx/init` ever arrives.
- The **Save** toolbar button is disabled (`session.standalone` guards it in `App.tsx`).
- **Play still works** — `audio.ts` only touches the Web Audio API, never the bridge.

This is the "guard the bridge" requirement — every bridge touch in this webview goes through `useZzfxSession`, which is the single try/catch boundary.

## Param round-trip (`params.ts`)

`toArgs`/`fromArgs` are the canonicalization pair for the `number[]` the bridge and source code exchange:

- `fromArgs(args)` — inverse of `toArgs`. Missing trailing elements (array shorter than 21) or `null`/`undefined` holes fill in from `PARAM_SPECS[key].default`, then every value is clamped via `clampParam`.
- `toArgs(params)` — full 21-value positional array with the **trailing** run of default-valued params trimmed (right-to-left), matching zzfx's own sparse-array convention (`zzfx(...[,,,,.1,,,,9])`). Only trailing defaults trim; a default sitting before a later non-default param stays dense (the result is always a plain `number[]`, never a sparse array with holes).
- `toDenseArgs(params)` — same values, no trimming; used by `audio.ts` for playback where zzfx just needs all 21 positions.

Round-trip: `fromArgs(toArgs(params))` reproduces `params` (up to `clampParam`'s clamping/rounding). Covered in `params.test.ts`.

## AI Generate (`zzfx/generate`) — #148 Z5

The webview side (this button, streaming readout, state) is fully implemented. The host-side logic (`extension/tools/zzfx/`) is also fully implemented and unit-tested — **but nothing wires `bridge.on('zzfx/generate', ...)` into a live panel yet**, because there is no live panel until Z3 lands. That wiring is Z3's job; everything it needs is described here.

```ts
// webview -> host
type ZzfxGeneratePayload = { category?: string; styles?: string[] }

// resolved value of the zzfx/generate request
type ZzfxGenerateResult = {
  ok: true
  params: number[] // canonical trailing-trimmed args — params.ts's toArgs()
  source: 'lm' | 'preset' | 'cache'
}

// host -> webview, zero or more times while a request is in flight
type ZzfxGenerateProgressEvent = { chunk: string }
```

`source` is not cosmetic — the webview shows a different confirmation string for each (`AiGeneratePanel.tsx`'s `sourceLabel`), so "AI Generate" never silently claims to have used AI when it actually degraded to a preset.

### What Z3 needs to add to its `host.ts`

```ts
import { generateZzfxParams } from './lmService'
import { createSha256Hasher, createVscodeCacheStore, createVscodeLmCaller } from './vscodeLmAdapter'

const lm = createVscodeLmCaller()
const cache = createVscodeCacheStore(context) // context: vscode.ExtensionContext
const hash = createSha256Hasher()

bridge.on<ZzfxGeneratePayload>('zzfx/generate', async ({ category, styles }) => {
  const result = await generateZzfxParams({
    category,
    styles: styles ?? [],
    lm,
    cache,
    hash,
    onChunk: (chunk) => bridge.emit('zzfx/generate/progress', { chunk }),
  })
  return { ok: true, params: toArgs(result.params), source: result.source }
})
```

That's the entire integration surface — `generateZzfxParams` (in `extension/tools/zzfx/lmService.ts`) owns the whole cache → LM → retry → preset-fallback state machine; the host handler is just plumbing.

### How the pieces fit (`extension/tools/zzfx/`)

| File                    | What                                                                                                                                                                                                                                                                                                                                                                                | Unit-tested?                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lmService.ts`          | `generateZzfxParams` — the orchestrator (cache check → LM call → validate → one retry → preset fallback → cache write). Dependency-injected (`LmCaller`, `CacheStore`, `hash`) so the whole state machine is testable with fakes, no real `vscode.lm`.                                                                                                                              | Yes — `lmService.test.ts`, 12 cases covering every branch.                                                                                                     |
| `promptTemplate.ts`     | `buildPrompt`/`buildRetryPrompt` — builds the LM prompt directly from `PARAM_SPECS`/`PARAM_ORDER` (imported from `../../../webview/zzfx/params.ts`) so the described schema can never drift from the real clamp ranges.                                                                                                                                                             | Yes.                                                                                                                                                           |
| `validateLmResponse.ts` | Parses + validates a raw LM text response into `Partial<Record<ParamKey, number>>` — strips a stray ` ```json ` fence, filters unrecognized keys and non-finite values, only fails on unparseable JSON or zero usable keys.                                                                                                                                                         | Yes.                                                                                                                                                           |
| `presets.ts`            | `curatedPreset(category, styles)` — one baseline per category + a deterministic modifier per style tag (applied in selection order), fully clamped output. Used for every fallback path.                                                                                                                                                                                            | Yes — includes exhaustiveness tests against the webview's `CATEGORIES`/`STYLES` lists.                                                                         |
| `vscodeLmAdapter.ts`    | Thin real implementations: `createVscodeLmCaller()` (wraps `vscode.lm.selectChatModels` + `sendRequest`, 20s timeout via `CancellationTokenSource`, treats `vscode.lm` absence/errors as "no model" rather than throwing), `createVscodeCacheStore(context)` (JSON blob at `<globalStorageUri>/zzfx-lm-cache.json`, capped at 200 entries), `createSha256Hasher()` (`node:crypto`). | No — real `vscode`/fs/crypto glue, same precedent as `webview/zzfx/audio.ts`'s untested `AudioContext` boundary. Verify manually once wired into a live panel. |

### Retry + cache + fallback behavior

1. `sha256(prompt)` cache hit → `source: 'cache'`, LM never called.
2. Live call, response validates → `source: 'lm'`, canonical params cached under that hash for next time.
3. Response fails validation (unparseable / not an object / zero recognized numeric keys) → **one** corrective retry with a follow-up prompt that echoes the failure reason.
4. Model unavailable (`vscode.lm` missing, no models installed/signed-in, consent declined, timeout, any error), or still invalid after the retry → `curatedPreset(category, styles)`, `source: 'preset'`. **Never cached** — caching a preset would block a retry once the model becomes available.

`vscode.lm` genuinely may not exist at all in some editor hosts this extension targets (its `package.json` description lists VSCode, Cursor, Antigravity) — `createVscodeLmCaller` treats that the same as "no models returned," not an error, so the whole feature degrades to presets gracefully rather than showing an error banner.

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

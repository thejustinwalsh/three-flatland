# FL ZzFX Studio — webview

Sound-effect editor for [zzfx](https://github.com/KilledByAPixel/ZzFX) params, surfaced via a CodeLens on `zzfx(...)` calls in source. **This directory is the webview only.** The CodeLens provider + host-side wiring (opening the panel, resolving the finding, writing the save back into source) is a separate unit — issue #148, sub-task Z3. This README is the contract that unit builds against.

## Files

| File                                      | What                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params.ts`                               | The 21-param model: `ParamKey`, `PARAM_SPECS` (label/default/min/max/step), `PARAM_GROUPS` (UI grouping), `defaultParams`/`clampParam`/`toArgs`/`fromArgs`. Also `CATEGORIES`/`STYLES`/`MAX_STYLES`. |
| `sliderMath.ts`                           | Pure drag math for `Slider.tsx` (`computeDragValue`, `snapToStep`, `ratioForValue`) — unit-tested without a DOM.                                                                                     |
| `protocol.ts`                             | Bridge message types — `ZzfxInitPayload`, `ZzfxSavePayload`, result types. Source of truth for the host-wiring unit.                                                                                 |
| `audio.ts`                                | Lazy zzfx playback — dynamic-imports `zzfx` and resumes its `AudioContext` from inside a user-gesture handler.                                                                                       |
| `zzfx.d.ts`                               | Ambient module declaration — the `zzfx` npm package ships no `.d.ts`. Mirrors `minis/breakout/src/zzfx.d.ts`; keep in sync if the pinned version changes.                                            |
| `Slider.tsx`, `Pill.tsx`, `PillGroup.tsx` | Locally-composed primitives (see "Local primitives" below).                                                                                                                                          |
| `ParamRow.tsx`, `ParamGroup.tsx`          | One param row (slider + NumberField, or a dropdown for `shape`); one collapsible group of rows.                                                                                                      |
| `AiGeneratePanel.tsx`                     | Feature-flagged (`AI_GENERATE_ENABLED = false`) placeholder — the real AI Generate flow is issue #148 Z5. Renders `null` until flipped.                                                              |
| `useZzfxSession.ts`                       | Bridge handshake + all editable state (params, category, styles, save).                                                                                                                              |
| `App.tsx`, `main.tsx`, `index.html`       | Standard tool boot — see `tools/vscode/CLAUDE.md`.                                                                                                                                                   |

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

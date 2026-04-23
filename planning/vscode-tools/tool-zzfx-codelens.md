# Tool: ZzFX CodeLens + Editor

## Goal

Inline play + edit controls above every `zzfx(...)` call in the editor. Clicking edit opens a webview that can tweak parameters, preview audio, and optionally ask the user's Copilot model for AI-generated variations.

## User flow

1. Open a `.ts/.tsx/.js/.jsx` file containing `zzfx([1, 0.05, 220, …])`.
2. CodeLens above the call shows `▶ Play` and `⚙ Edit`.
3. `▶ Play` — plays the sound in the extension host (via webview singleton) without opening any UI.
4. `⚙ Edit` — opens a webview panel pinned to that call site. Sliders for each of the 21 params + AI-generate panel + save button.
5. Save writes a `WorkspaceEdit` that replaces only the argument list; user's formatter handles whitespace.

## Architecture

```
Extension host                             Webview (ZzFX editor)
  ZzfxCodeLensProvider                       React app
    ↓ talks to                                 - zzfx.js bundled in
  ZzfxScanService                              - sliders, category pills
    ↓ owns                                     - play button → AudioContext
  Go sidecar process (zzfx-scan)               - "Generate" → postMessage('lm.generate', …)
    tree-sitter + tree-sitter-typescript
    stdio JSON-RPC

Extension host also:
  - ZzfxEditorCommand — opens webview for a given range
  - ZzfxLmService — wraps vscode.lm, caches responses
```

## ZzFX parameter spec (21 positional)

From `ZzFXMicro.min.js` v1.3.2:

| # | Name | Default | Range | Meaning |
|---|---|---|---|---|
| 0 | volume | 1 | 0..1 | master volume |
| 1 | randomness | 0.05 | 0..2 | per-play pitch jitter |
| 2 | frequency | 220 | 0..20000 Hz | base pitch |
| 3 | attack | 0 | 0..1 s | |
| 4 | sustain | 0 | 0..1 s | |
| 5 | release | 0.1 | 0..1 s | |
| 6 | shape | 0 | 0..4 int | 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise |
| 7 | shapeCurve | 1 | -1..3 | waveform warp |
| 8 | slide | 0 | -9..9 | linear pitch slide |
| 9 | deltaSlide | 0 | -1..1 | slide acceleration |
| 10 | pitchJump | 0 | -1200..1200 ¢ | |
| 11 | pitchJumpTime | 0 | 0..1 s | when pitch jump fires |
| 12 | repeatTime | 0 | 0..1 s | loop period (0 = no repeat) |
| 13 | noise | 0 | 0..1 | noise mix |
| 14 | modulation | 0 | 0..100 | FM depth |
| 15 | bitCrush | 0 | 0..1 | |
| 16 | delay | 0 | 0..1 s | echo |
| 17 | sustainVolume | 1 | 0..1 | sustain level |
| 18 | decay | 0 | 0..1 s | |
| 19 | tremolo | 0 | 0..1 | |
| 20 | filter | 0 | -2000..2000 Hz | >0 high-pass, <0 low-pass, 0 off |

Canonicalized labels surface in the editor; trailing zeros may be omitted in source.

## Scanner (Go sidecar)

**Package**: `packages/zzfx-scan/` (Go module).

**Parser**: tree-sitter + `tree-sitter-typescript` via `github.com/tree-sitter/go-tree-sitter`. Single query matches `zzfx(...)` calls with a literal-array argument. Comments and strings are excluded by grammar.

```
(call_expression
  function: (identifier) @fn (#eq? @fn "zzfx")
  arguments: (arguments (array) @args))
```

**Fallback (if cgo cross-compile proves painful)**: pure-Go regex + hand-rolled TS tokenizer. Decide after prototyping one platform.

**JSON-RPC protocol** (via `vscode-jsonrpc`):

```
initialize { workspaceRoot }                       → { version, capabilities }
workspace/scan { include?, exclude?, maxFiles? }   → { matches: [{ uri, ranges: [...] }] }
document/parse { uri, text }                       → { findings: [{ range, params, varRef? }] }
document/didChange { uri, changes }                → incremental update (v1)
shutdown                                           → void
```

**Why sidecar over TS in-process**: tree-sitter TS works in Node but ships as native module requiring platform-specific binaries anyway. Go sidecar isolates ABI + lets us reuse the same scanner strategy for future tools (e.g. flatland API call analytics).

## CodeLens provider

Shallow at activation, deep on demand:

1. **Activation**: `workspace.findFiles('**/*.{ts,tsx,js,jsx,mjs,cjs}', '**/node_modules/**', 2000)` → shortlist fed to scanner's `workspace/scan`. Cache hit/miss per file in `storageUri/zzfx-index.json`.
2. **On open** (`onDidOpenTextDocument`): if file is in candidate list and not cached by `(mtime, size, contentHash)`, call `document/parse`.
3. **On change** (`onDidChangeTextDocument`): debounce 350 ms, full reparse (parser is fast enough at typical file sizes). Fire `onDidChangeCodeLenses`.
4. **`provideCodeLenses`**: read from in-memory map only; never block.
5. **`resolveCodeLens`**: fill title + command.

Two lenses per finding:
- `▶ Play` → `threeFlatland.zzfx.playParams` with params array.
- `⚙ Edit` → `threeFlatland.zzfx.openEditor` with `{ uri, range, params, varRef? }`.

### Non-literal arguments

`zzfx(...LASER_SHOT)` or `zzfx(myPreset)`: scanner emits `varRef: { name, defRange? }`. Lens becomes `⚙ Edit (variable)` — opening it resolves the definition (scanner chases single-file references; cross-file references are a v1.1 nice-to-have) and writes back there.

## Editor webview

**Stack**: React 19, VSCode Elements, bundled zzfx.js, AudioContext for playback, postMessage bridge for save.

**Panels**:
- Sliders for all 21 params, grouped (envelope, pitch, shape, effects). NumberField composite for precision.
- Category pills (single-select): `Pickup`, `Laser`, `Explosion`, `Powerup`, `Hit`, `Jump`, `Blip`, `UI Click`, `Footstep`, `Door`, `Alarm`, `Heartbeat`.
- Style pills (multi-select, max 3): `retro 8-bit`, `chiptune`, `clean`, `punchy`, `boomy`, `thin`, `high`, `low`, `snappy`, `long tail`, `cute`, `menacing`, `robotic`, `metallic`, `glitchy`.
- **AI Generate** button (only if `vscode.lm` available). Produces 4–6 candidate cards with Label + rationale + preview play button + "Use this" action.
- Save button → posts updated array to host, which runs `WorkspaceEdit` on the original range.

**AudioContext**: single context per webview, `resume()` on first user gesture. CSP needs `media-src blob:` for future WAV export.

## AI generation

Prompt template:

```
System:
You are ZzFX-GPT. Output ONLY valid JSON matching this schema:
{ "candidates": [ { "label": string, "params": number[], "rationale": string } ] }
ZzFX params are positional (length 8..21):
  [volume(0..1), randomness(0..2), frequency(0..20000), attack(0..1),
   sustain(0..1), release(0..1), shape(0..4 int),
   shapeCurve(-1..3), slide(-9..9), deltaSlide(-1..1),
   pitchJump(-1200..1200), pitchJumpTime(0..1), repeatTime(0..1),
   noise(0..1), modulation(0..100), bitCrush(0..1), delay(0..1),
   sustainVolume(0..1), decay(0..1), tremolo(0..1), filter(-2000..2000)]
Rules:
  - Trailing zeros may be omitted.
  - shape MUST be an integer in 0..4.
  - Output exactly {N} candidates.
  - Never wrap output in code fences or prose.

User:
Generate {N} variations of a "{category}" sound with style: {adjectives}.
Example seeds (known-good for this category):
  {seed1}
  {seed2}
```

Seeds sourced from the KilledByAPixel/ZzFX README examples and designer presets. Hardcoded per category.

**Validation**: reject arrays with `shape ∉ 0..4`, `volume > 1`, or out-of-range frequency. On parse failure, retry once with `"Previous response was not valid JSON. Return only the object."`.

**Cache**: key = `sha256(model.id, promptVersion, category, sortedAdjectives, N)`. Store in `globalStorageUri/zzfx-lm-cache.json`. Invalidate on `promptVersion` bump.

**Streaming**: stream `response.text` into UI so candidates populate live.

**Degrade**: if `vscode.lm.selectChatModels({vendor:'copilot'})` returns `[]` or consent denied, hide Generate panel and show a curated preset library instead (same seeds, no AI).

## Write-back

`WorkspaceEdit` replaces only the arg list byte range (from scanner). Respects user formatter via `editor.formatOnSave` triggering naturally. Don't modify other lines.

For variable-definition write-back, edit the value range of the variable declarator (e.g. `const LASER = [...]`'s array literal).

## Risks + follow-ups

1. **LM API instability** — feature-flag the generate panel, degrade gracefully.
2. **cgo cross-compile matrix** — plan CI matrix early. `zig cc` simplifies.
3. **Scanner cold-start on huge repos** — `maxFiles: 2000` cap. Beyond that, ask user to open files to activate scanning.
4. **Performance on sound-bank modules with 100+ `zzfx(...)` calls** — throttle resolve, batch play-lens commands, consider a per-file toggle in status bar.
5. **Non-literal arg write-back across files** — v1.1; start single-file-only.

## References

- [ZzFX repo](https://github.com/KilledByAPixel/ZzFX)
- [ZzFXMicro.min.js](https://github.com/KilledByAPixel/ZzFX/blob/master/ZzFXMicro.min.js)
- [ZzFX designer](https://killedbyapixel.github.io/ZzFX/)
- [tree-sitter go bindings](https://github.com/tree-sitter/go-tree-sitter)
- [tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript)
- [vscode-jsonrpc](https://www.npmjs.com/package/vscode-jsonrpc)
- [VSCode LM API guide](https://code.visualstudio.com/api/extension-guides/ai/language-model)

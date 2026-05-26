# Tool: ZzFX Studio (CodeLens + Sound Editor)

## Goal

Inline `▶ Play` / `⚙ Edit` CodeLens above every `zzfx(...)` call. Edit opens a webview with sliders, category pills, and optional `vscode.lm` AI generation. Saves write back only the argument list, respecting the user's formatter.

Portability note: this plugin may migrate to its own `zzfx-studio` repo. What's durable is the `tools/codelens-service/` pattern — a shared Go sidecar with tree-sitter + SQLite cache + JSON-RPC that future CodeLens tools (dev-tools interop, flatland API analytics, etc.) plug into.

## Architecture

```
Extension host (ESM)                           Webview (React + StyleX)
  ZzfxCodeLensProvider                           React app
    ↓ via codelens-service/ts client         - sliders, pills, preview
  Go sidecar: zzfx-scan                            - bundled zzfx.js
    tree-sitter + tree-sitter-typescript          - AudioContext playback
    modernc.org/sqlite — per-project cache        - postMessage bridge
    stdio JSON-RPC (LSP framing)

  ZzfxEditorCommand — opens/focuses webview for a finding
  ZzfxLmService     — wraps vscode.lm, caches responses in globalStorageUri
```

## Scanner strategy

User's original research: **shallow workspace scan + deep on-demand parse + line-hashing cache + AST-based detection**. Implemented as:

### Tier 1: shallow workspace scan (activation)

- `workspace.findFiles('**/*.{ts,tsx,js,jsx,mjs,cjs}', '**/node_modules/**', 2000)` on activation.
- Call sidecar `workspace/scan { candidates: uris[] }` — sidecar does a fast ripgrep-style byte scan for the literal `zzfx` in non-comment regions, returns `{ uri, hasCandidate: bool, contentHash }` records.
- Results written to SQLite `files` table for future sessions.
- Time budget: <500 ms on a 2000-file repo (untouched by prior runs); near-zero if SQLite `content_hash` matches (no file change since last scan).

### Tier 2: deep on-demand parse

- `onDidOpenTextDocument` → call `document/parse { uri, text }` if file is flagged hasCandidate.
- Sidecar: SQLite lookup by `(path, mtime, size)`. If cached and fresh, return findings immediately.
- On miss: tree-sitter parse + run the `zzfx` call query → findings list → write-through to SQLite (files, findings, line_hashes) in one transaction → return to client.

### Tier 3: incremental on change

- `onDidChangeTextDocument` debounced 350 ms.
- Client sends the doc text; sidecar diffs line hashes from cache and reparses only the enclosing statements of changed lines. At typical file size (<5k lines), full reparse is ~5–15 ms — good enough; reserve incremental parsing as a later optimization.

## Sidecar JSON-RPC protocol

Defined in `tools/codelens-service/` and shared with every future scanner. The zzfx scanner is a concrete instance.

```ts
// requests
initialize { workspaceRoot: string, storageUri: string }
  → { version: string, capabilities: { scan: true, parse: true, incremental: true } }

workspace/scan { candidates?: string[], include?: string, exclude?: string, maxFiles?: number }
  → { matches: { uri: string, contentHash: string, hasCandidate: boolean }[] }

document/parse { uri: string, text: string }
  → { uri: string, findings: Finding[] }

document/didChange { uri: string, text: string, changes?: TextDocumentContentChange[] }
  → notification; triggers incremental reparse

shutdown → void

// Finding
{
  kind: 'zzfx.call',
  id: string,                 // stable: fnv1a(scanner + byte-range + canonical-params)
  range: { start: Pos, end: Pos },
  byteRange: { start: number, end: number },
  payload: {
    params: number[],         // length 0..21
    argRange: { start: Pos, end: Pos },  // arg-list only, for WorkspaceEdit
    varRef?: { name: string, defUri?: string, defRange?: Range }  // if spread/variable
  }
}
```

## ZzFX parameter spec (21 positional)

From `ZzFXMicro.min.js` v1.3.2:

| # | Name | Default | Range | Notes |
|---|---|---|---|---|
| 0 | volume | 1 | 0..1 | master |
| 1 | randomness | 0.05 | 0..2 | per-play pitch jitter |
| 2 | frequency | 220 | 0..20000 Hz | base pitch |
| 3 | attack | 0 | 0..1 s | |
| 4 | sustain | 0 | 0..1 s | |
| 5 | release | 0.1 | 0..1 s | |
| 6 | shape | 0 | 0..4 int | 0 sine, 1 triangle, 2 saw, 3 tan, 4 noise |
| 7 | shapeCurve | 1 | -1..3 | waveform warp |
| 8 | slide | 0 | -9..9 | linear pitch slide |
| 9 | deltaSlide | 0 | -1..1 | slide accel |
| 10 | pitchJump | 0 | -1200..1200 ¢ | |
| 11 | pitchJumpTime | 0 | 0..1 s | |
| 12 | repeatTime | 0 | 0..1 s | loop period; 0 = no repeat |
| 13 | noise | 0 | 0..1 | |
| 14 | modulation | 0 | 0..100 | FM depth |
| 15 | bitCrush | 0 | 0..1 | |
| 16 | delay | 0 | 0..1 s | |
| 17 | sustainVolume | 1 | 0..1 | |
| 18 | decay | 0 | 0..1 s | |
| 19 | tremolo | 0 | 0..1 | |
| 20 | filter | 0 | -2000..2000 Hz | >0 highpass, <0 lowpass |

Trailing zeros may be omitted in source.

## CodeLens provider

Return only `range` in `provideCodeLenses`; compute titles in `resolveCodeLens`. Two lenses per finding:

- `▶ Play` → `threeFlatland.zzfx.playParams` with params array (CodeLens inline — no FL prefix, context is clear from position)
- `⚙ Edit` → `threeFlatland.zzfx.openEditor` with `{ uri, findingId }`

Command palette versions use the FL category: `FL: Play ZzFX at Cursor`, `FL: Open ZzFX Editor`. Registered as:

```json
"commands": [
  { "command": "threeFlatland.zzfx.playAtCursor", "title": "Play ZzFX at Cursor", "category": "FL" },
  { "command": "threeFlatland.zzfx.openEditor",   "title": "Open ZzFX Editor",    "category": "FL" }
]
```

Fire `onDidChangeCodeLenses` on sidecar `document/parse` completion, debounced 250 ms.

### Non-literal args

`zzfx(...LASER)` or `zzfx(myPreset)`: lens becomes `⚙ Edit (variable)`. On open, client asks sidecar to resolve the reference (v0: single-file only; v1: cross-file). Write-back edits the value range of the variable declarator.

## Editor webview

- React 19 + StyleX + VSCode Elements (sliders + pills composed with StyleX primitives from `design-system`).
- Bundled `zzfx.js` (<1 KB minified). AudioContext created lazily; resumed on first user gesture (required by autoplay policy).
- Panels:
  - **Sliders** for 21 params, grouped: envelope, pitch, shape, effects.
  - **Category pills** (single-select): Pickup, Laser, Explosion, Powerup, Hit, Jump, Blip, UI Click, Footstep, Door, Alarm, Heartbeat.
  - **Style pills** (multi-select, max 3): `retro 8-bit`, `chiptune`, `clean`, `punchy`, `boomy`, `thin`, `high`, `low`, `snappy`, `long tail`, `cute`, `menacing`, `robotic`, `metallic`, `glitchy`.
  - **AI Generate** (only when `vscode.lm` available) — N candidate cards with label, rationale, play, "Use this".
  - **Save** → posts array to host → `WorkspaceEdit` on `payload.argRange`.

CSP: standard webview + `media-src ${cspSource} blob:` to allow future WAV export via `URL.createObjectURL(Blob)`.

## AI generation

Prompt template:

```
System:
You are ZzFX-GPT. Output ONLY valid JSON matching:
{ "candidates": [ { "label": string, "params": number[], "rationale": string } ] }
Params are positional (length 8..21):
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
Example seeds:
  {seed1}
  {seed2}
```

- Validate output: `shape ∈ 0..4`, `volume ≤ 1`, frequency in range. Retry once on parse failure.
- Cache key: `sha256(model.id, promptVersion, category, sortedAdjectives, N)`. Stored in `${globalStorageUri}/zzfx-lm-cache.json`. Invalidate on promptVersion bump.
- Stream `response.text` into UI.
- Degrade: if `vscode.lm.selectChatModels({vendor:'copilot'})` returns `[]`, hide Generate panel and surface a curated preset library (same seed values).

## Write-back

`WorkspaceEdit` replaces only `payload.argRange`. User's formatter handles whitespace on save. For variable-reference write-back, edit the variable's value range.

## Risks

1. **LM API instability** — feature-flag the Generate panel; degrade to presets.
2. **cgo cross-compile matrix** — tree-sitter needs cgo. Use `zig cc` on CI; verify all 5 platforms early.
3. **SQLite on virtual/remote workspaces** — if `storageUri` isn't a real filesystem, degrade to in-memory cache with a toast.
4. **Write-back precision** — argRange must be the arg list only, not the `zzfx(` or `)`. Already in the scanner spec; verify in tests.
5. **Portability when migrating to `zzfx-studio` repo** — the `tools/codelens-service/` package and its Go sidecar should be publishable standalone, or vendored. Decide before splitting.

## References

- [ZzFX repo + ZzFXMicro.min.js](https://github.com/KilledByAPixel/ZzFX)
- [ZzFX designer](https://killedbyapixel.github.io/ZzFX/)
- [tree-sitter go bindings](https://github.com/tree-sitter/go-tree-sitter)
- [tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript)
- [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) — pure-Go SQLite
- [vscode-jsonrpc](https://www.npmjs.com/package/vscode-jsonrpc)
- [VSCode LM API](https://code.visualstudio.com/api/extension-guides/ai/language-model)

# Suite Architecture

## Monorepo layout

`tools/*` is a new workspace root. Added to `pnpm-workspace.yaml`. Tool names are not prefixed with `vscode-` because every tool targets the VSCode extension API, which is portable across VSCode, Cursor, Antigravity, VSCodium, and similar hosts.

```
tools/
  ext/                        # the single VSIX publishing target
    package.json              # @three-flatland/tools, private: true
    esbuild.config.mjs        # host bundle → dist/extension.js (ESM)
    vite.config.ts            # webview bundles → dist/webview/<tool>/*
    src/
      extension.ts            # activate() — dispatches to each tool module
      tools/
        zzfx/        { codeLens.ts, editor.ts, scanner-client.ts, webview/ }
        atlas/       { customEditor.ts, slice.ts, webview/ }
        normalBaker/ { command.ts, webview/ }
        spark/       { command.ts, webview/ }
    bin/                      # all Go binaries packed into the VSIX
      darwin-arm64/zzfx-scan
      darwin-x64/zzfx-scan
      linux-x64/zzfx-scan
      linux-arm64/zzfx-scan
      win32-x64/zzfx-scan.exe

  zzfx-studio/                # extension-facing TS wrapper for the zzfx plugin
                              # thin — may migrate to standalone zzfx-studio repo later
                              # (v0: may just live in tools/ext/src/tools/zzfx/)

  codelens-service/           # shared Go sidecar source + TS client
    go/                       # Go module root (module tools/codelens-service/go)
      cmd/zzfx-scan/          # one binary per scan target
      cmd/<future>-scan/
      internal/scanner/       # tree-sitter harness
      internal/cache/         # SQLite (modernc.org/sqlite) — pure Go
      internal/rpc/           # JSON-RPC (LSP framing)
    ts/                       # @three-flatland/tools-codelens-service
      src/                    # TS client: spawn, RPC, session, CodeLens provider helper

  design-system/              # @three-flatland/tools-design-system
    src/                      # StyleX + VSCode Elements wrappers

  preview/                    # @three-flatland/tools-preview
    src/                      # R3F components: SpritePreview, NormalPreview, AtlasPreview

  io/                         # @three-flatland/tools-io
    src/                      # image decode/encode, sidecar read/write, JSON Schema + ajv validators
    schemas/                  # JSON Schema files (atlas.schema.json, etc.)

  bridge/                     # @three-flatland/tools-bridge
    src/                      # typed postMessage RPC (host + client)
```

Every `tools/*` package is `private: true`. The VSIX inlines them via esbuild/Vite — nothing ships as a separate npm dep.

CLIs (`flatland-bake`, `slug-bake`, future bakers) continue to live in `packages/*`. `tools/*` is strictly editor integrations.

## Packaging

**One VSIX, all platforms.** Go cross-compiles trivially (pure-Go path; tree-sitter cgo still works with `zig cc`). Pack all binaries under `tools/ext/bin/<platform>-<arch>/`. At activation:

```ts
const bin = path.join(
  context.extensionPath, 'bin',
  `${process.platform}-${process.arch}`,
  scannerName + (process.platform === 'win32' ? '.exe' : '')
)
```

Rough sizes: pure-Go tree-sitter + SQLite binary ≈ 10–15 MB stripped. Five platforms ≈ 50–75 MB VSIX. Acceptable for internal tooling; simpler than per-platform VSIX builds and removes the CI matrix.

If size becomes a problem, fall back to `vsce package --target <id>` per platform.

## ESM-only

VSCode extension host gained ESM support in v1.94 (2024-10). We target it exclusively.

- `tools/ext/package.json`: `"type": "module"`, `engines.vscode: "^1.94.0"`, `"main": "./dist/extension.js"`.
- **Host bundle** (esbuild): `format: 'esm'`, `platform: 'node'`, `target: 'node20'`, `external: ['vscode']`.
- **Webview bundles** (Vite): always ESM; one entry per tool via `build.rollupOptions.input`.
- All shared packages (`tools/*` except `ext`) ship ESM only — no dual builds.

`@types/vscode: ^1.94.0`.

## Go sidecar strategy

Sidecars are Go binaries spawned by the extension host on demand. v0 ships one: `zzfx-scan`. The codelens-service pattern makes additional sidecars cheap.

- **Parser**: tree-sitter + language grammar (`tree-sitter-typescript`, future: `tree-sitter-go`, etc.) via `github.com/tree-sitter/go-tree-sitter`. cgo is the cost; in exchange we get S-expression queries, incremental parsing, and correct string/comment handling.
- **RPC**: `vscode-jsonrpc` on the TS side, stdio LSP framing on the Go side. Shared schema types in `tools/codelens-service/` package exports.
- **Process lifecycle**: singleton per extension-host instance. Spawn on first use. Kill on `deactivate()` via `context.subscriptions.push({ dispose: () => child.kill() })`.
- **Binary selection**: per `process.platform + process.arch` at activation (see above).

### SQLite cache (per-project, persists across reloads)

Pure-Go SQLite via `modernc.org/sqlite` — no cgo, cross-compiles like every other Go build. Database lives at `${storageUri}/codelens.sqlite` (per-workspace, automatic scoping).

Schema (shared across every codelens-service scanner):

```sql
CREATE TABLE IF NOT EXISTS files (
  path         TEXT PRIMARY KEY,
  mtime        INTEGER NOT NULL,
  size         INTEGER NOT NULL,
  content_hash TEXT    NOT NULL,   -- FNV-1a 64-bit of file bytes
  scanned_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS findings (
  file_path    TEXT    NOT NULL REFERENCES files(path) ON DELETE CASCADE,
  finding_id   TEXT    NOT NULL,   -- stable id: scanner + byte-range + node-hash
  line_start   INTEGER NOT NULL,
  line_end     INTEGER NOT NULL,
  byte_start   INTEGER NOT NULL,
  byte_end     INTEGER NOT NULL,
  kind         TEXT    NOT NULL,   -- 'zzfx.call', etc. (namespaced)
  payload      TEXT    NOT NULL,   -- canonicalized JSON
  PRIMARY KEY (file_path, finding_id)
);

CREATE TABLE IF NOT EXISTS line_hashes (
  file_path  TEXT    NOT NULL REFERENCES files(path) ON DELETE CASCADE,
  line       INTEGER NOT NULL,
  hash       TEXT    NOT NULL,
  PRIMARY KEY (file_path, line)
);

CREATE INDEX IF NOT EXISTS findings_by_file ON findings(file_path);
```

Behavior:
1. On `document/parse` the sidecar checks `files` for `(path, mtime, size)` match; if fresh, returns cached findings.
2. On mismatch, reparses, updates `files` + `findings` + `line_hashes` in a single transaction.
3. On workspace scan, pre-filter candidates by `files.content_hash` and skip unchanged files entirely.
4. On deactivation, no cleanup — the cache persists for the next session.

The DB is project-scoped because `storageUri` is. `globalStorageUri` holds only LM-generation caches and downloaded models (if any).

## Toolchain

| Layer | Tool | Notes |
|---|---|---|
| Host bundler | esbuild | ESM, `platform: 'node'`, `target: 'node20'`, `external: ['vscode']` |
| Webview bundler | Vite 7 + React 19 | Multi-entry; one per tool |
| Dev harness | `@tomjs/vite-plugin-vscode` | Runs both bundles with HMR |
| CSS-in-JS | StyleX (`@stylexjs/stylex`) | Custom primitives; atomic CSS, static extraction |
| Unit tests | Vitest | Pure logic, schema validation, parsers |
| Integration tests | `@vscode/test-cli` + `@vscode/test-electron` | Actual API surface; Mocha-based |
| Go tests | `go test ./...` | Scanner correctness, SQLite cache invariants |
| Packaging | `@vscode/vsce package` | Platform-neutral VSIX with all binaries packed |
| Types | `@types/vscode: ^1.94.0` | Matches `engines.vscode` |
| Dev ext | `connor4312.esbuild-problem-matchers` | `.vscode/extensions.json` recommendation |

## What goes in the host vs webview

| Concern | Extension host | Webview |
|---|---|---|
| File I/O (`workspace.fs`) | yes | no (use bridge) |
| Spawn Go sidecar | yes | no |
| JSON Schema validation (ajv) | yes (authoritative) | yes (optimistic) |
| `vscode.lm` calls | yes (proxy responses over bridge) | no |
| R3F preview | no | yes |
| Audio playback | no | yes (AudioContext) |
| BasisU/KTX2 encode | yes (spawn worker or run in-host) | no |
| Sidecar write | yes (`WorkspaceEdit` respects formatter) | no |

Webview never touches the filesystem directly — bridge only.

## Settings namespace

```json
"contributes.configuration": {
  "title": "three-flatland Tools",
  "properties": {
    "threeFlatland.zzfx.enabled":        { "type": "boolean", "default": true },
    "threeFlatland.atlas.autoSliceMode": { "enum": ["grid","auto","off"], "default": "off" },
    "threeFlatland.atlas.defaultFormats": {
      "type": "array",
      "items": { "enum": ["ktx2","webp","png"] },
      "default": ["webp","png"]
    },
    "threeFlatland.preview.background":  { "enum": ["checker","solid","gradient","noise"], "default": "checker" },
    "threeFlatland.lm.enabled":          { "type": "boolean", "default": true },
    "threeFlatland.lm.maxCandidates":    { "type": "integer", "default": 6, "minimum": 1, "maximum": 12 }
  }
}
```

## Commands

Prefix: `threeFlatland.<tool>.<action>`.

- `threeFlatland.zzfx.playAtCursor`
- `threeFlatland.zzfx.openEditor`
- `threeFlatland.atlas.openEditor`
- `threeFlatland.normalBaker.open`
- `threeFlatland.spark.convert`

## Publishing

Internal. Pipeline: changesets → version bump → CI builds one VSIX containing all platform Go binaries → upload as GitHub Release asset. No Marketplace / Open VSX unless we decide to go public; both consume the same VSIX.

## Risk register

- **Binary size**: 5-platform pack may exceed 50 MB. Pre-calibrate with a `zzfx-scan` prototype before committing to the strategy. Fallback: per-platform VSIX via `vsce --target`.
- **cgo cross-compile**: tree-sitter needs cgo for its C runtime. Use `zig cc` as cross-toolchain on CI — proven pattern. Verify before the prototype phase.
- **ESM-only on older VSCode**: users on <1.94 can't install. Acceptable for internal; reconsider if we go public.
- **SQLite on virtual/remote workspaces**: `storageUri` may point to a remote fs the Go binary can't access. Detect at activation; degrade to in-memory cache with a toast if URI is non-local.

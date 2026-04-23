# Suite Architecture

## Packaging

**One VSIX, many tools.** Contribution arrays (`commands`, `codeLenses`, `customEditors`, `languageModelTools`) all accept multiple entries — there is no technical or ergonomic reason to split. Every multi-feature Microsoft extension (GitLens, Docker, Remote-SSH) ships this way.

Rationale:
- Shared design-system bundle loads once per webview category, not per tool.
- Shared Go sidecar is spawned once per workspace, not per extension.
- Single activation, single settings namespace (`threeFlatland.*`), single `OutputChannel`, single update cycle for internal users.
- Changesets + CI + publishing are one pipeline.

**Extension Packs** (`"extensionPack": [...]`) are a different concept — a meta-manifest that installs N separate extensions. Reserve for the case where sub-extensions are independently valuable to outside users. Not applicable here.

**Activation events** (`onCommand:…`, `onCustomEditor:…`, `onLanguage:typescript`) scope load costs per tool within the single extension.

## Monorepo layout

Sits alongside the existing three-flatland packages:

```
apps/
  vscode-tools/                   # the single VSIX (private)
    package.json                  # @three-flatland/vscode-tools
    esbuild.config.mjs            # host bundle → dist/extension.js (CJS)
    vite.config.ts                # webview bundles → dist/webview/<tool>/*
    src/
      extension.ts                # activate() wires up each tool
      tools/
        zzfx/        { codeLens.ts, editor.ts, scanner.ts, webview/ }
        atlas/       { customEditor.ts, slice.ts, webview/ }
        normalBaker/ { command.ts, webview/ }
    resources/
      bin/                        # Go sidecar binaries, per-platform
        darwin-arm64/zzfx-scan
        darwin-x64/zzfx-scan
        linux-x64/zzfx-scan
        win32-x64/zzfx-scan.exe

packages/
  vscode-design-system/           # React + VSCode Elements wrappers
  vscode-preview/                 # R3F components (SpritePreview, NormalPreview)
  vscode-io/                      # node+browser safe data layer
  vscode-webview-bridge/          # typed postMessage RPC
  normal-baker/                   # standalone CLI + lib, publishable on its own
  zzfx-scan/                      # Go source for the sidecar (module root)
```

`packages/*` are all `private: true` except `normal-baker` (publishable, mirrors `packages/slug` layout). The VSIX bundle inlines them via esbuild/Vite — nothing ships as a separate npm dep.

## Toolchain

| Layer | Tool | Notes |
|---|---|---|
| Scaffold | `yo code` (reference) then copy patterns from `githubnext/vscode-react-webviews` | Don't run yo against our repo; crib its output |
| Host bundler | esbuild | `platform: 'node'`, `format: 'cjs'`, `external: ['vscode']`, `minify: true` in prod |
| Webview bundler | Vite 7 + React 19 | One entry per tool; `build.rollupOptions.input` map |
| Dev harness | `@tomjs/vite-plugin-vscode` | Single config runs both bundles with HMR |
| Unit tests | Vitest (existing) | Pure logic: zzfx param validation, CCL, sidecar schema |
| Integration tests | `@vscode/test-cli` + `@vscode/test-electron` | Mocha-based; for actual VSCode API surface |
| Packaging | `@vscode/vsce package --target <id>` | Per-platform VSIX (Go binary matters) |
| Types | `@types/vscode: ^1.94.0`, `engines.vscode: ^1.94.0` | Conservative ~6mo-old floor |
| Dev ext | `connor4312.esbuild-problem-matchers` | In `.vscode/extensions.json` recommendations |

## Publishing

Internal-only target initially. Pipeline:

1. Changesets drive `package.json` version bumps on `apps/vscode-tools/` and `packages/normal-baker/`.
2. GitHub Action builds per-platform VSIX: matrix over `darwin-arm64|darwin-x64|linux-x64|linux-arm64|win32-x64`. Each matrix cell cross-compiles the Go sidecar, strips unused binaries, runs `vsce package --target <target>`.
3. Upload each `.vsix` as a release asset.
4. `packages/normal-baker` publishes to npm as public (so examples can use it).

If we ever go public:
- Marketplace: `vsce publish`
- Open VSX (VSCodium/Cursor): `ovsx publish`

Both take the same VSIX; no code changes needed.

## Go sidecar strategy

Only the ZzFX scanner needs a sidecar at v0. Everything else runs in the extension host or webview.

- **Transport**: stdio JSON-RPC via `vscode-jsonrpc`. No port conflicts, no firewall prompts, LSP-shape.
- **Location**: `resources/bin/<platform>-<arch>/<name>`. Platform-specific VSIX ensures the right binary ships.
- **Lifecycle**: Singleton per extension host. Spawn on first use, kill on `deactivate()` via `context.subscriptions.push({ dispose: () => child.kill() })`.
- **Build**: `zig cc` as C toolchain to simplify cross-compile when tree-sitter's cgo is involved. Build script under `packages/zzfx-scan/build.mjs`.

Parser choice for zzfx-scan: **tree-sitter + `tree-sitter-typescript`** via `github.com/tree-sitter/go-tree-sitter`. cgo is the cost; in exchange we get S-expression queries, incremental parsing, and correct comment/string handling — things regex gets wrong often enough to matter.

A pure-Go fallback is available (`goja/parser` for JS, hand-rolled TS tokenizer + regex) if cross-compile pain outweighs correctness wins. Decide after prototyping.

## Shared-package layout

```
packages/vscode-design-system/
  exports:
    '.'          → { Button, TextField, Tabs, Tree, Slider, NumberField, Dialog, Toolbar, ThemeProvider, useThemeKind, codiconUri }
    './styles'   → CSS reset + `--vscode-*` passthrough

packages/vscode-preview/
  peerDeps: react@^19, three, @react-three/fiber, three-flatland
  exports:
    './sprite'   → <SpritePreview sheet={...} rects={...} selected={...} />
    './normal'   → <NormalPreview albedo normal mode='split'|'lit' />
    './atlas'    → <AtlasPreview ...> (rect-overlay canvas on top of sheet)
    './rig'      → <LightRig /> (orbiting light for normal-map inspection)
    './hooks'    → { useTextureFromBytes, useTextureFromUri }

packages/vscode-io/
  target: 'node' + 'browser'
  exports:
    '.'          → { loadPng, encodePng, decodeToImageData }
    './sidecar'  → { SidecarSchema (zod), readSidecar, writeSidecar }
    './atlas'    → { AtlasJsonSchema, pack, unpack, autoSliceGrid, autoSliceCCL }
    './bridge'   → createFsBridge (webview ↔ extension postMessage FS ops)

packages/vscode-webview-bridge/
  exports:
    './host'     → createHostBridge(webview) — type-checked postMessage RPC
    './client'   → createClientBridge() — the acquireVsCodeApi() side
```

Apps import these by workspace protocol. Nothing in `packages/vscode-*` depends on `apps/vscode-tools` — one-way dependency graph.

## What goes in the host vs the webview

| Concern | Extension host | Webview |
|---|---|---|
| File I/O | yes (via `workspace.fs`) | no (use bridge) |
| Spawn Go sidecar | yes | no |
| `vscode.lm` calls | yes (proxy to webview via messages) | no |
| R3F preview | no | yes |
| Audio playback | no | yes (AudioContext) |
| Sidecar schema validation | yes (zod) | yes (same zod) |
| Sidecar write | yes (`WorkspaceEdit` respects formatter) | no |

The webview never touches the filesystem directly. All reads/writes go through the bridge. This keeps remote/virtual workspaces working.

## Settings namespace

```json
"contributes.configuration": {
  "title": "three-flatland Tools",
  "properties": {
    "threeFlatland.zzfx.enabled":        { "type": "boolean", "default": true },
    "threeFlatland.zzfx.scannerPath":    { "type": "string", "scope": "machine" },
    "threeFlatland.atlas.autoSliceMode": { "enum": ["grid","auto","off"], "default": "off" },
    "threeFlatland.preview.theme":       { "enum": ["light","dark","auto"], "default": "auto" },
    "threeFlatland.lm.enabled":          { "type": "boolean", "default": true }
  }
}
```

All settings namespaced under `threeFlatland.<tool>.<key>`.

## Commands

Prefix: `threeFlatland.<tool>.<action>`. E.g. `threeFlatland.zzfx.playAtCursor`, `threeFlatland.atlas.openEditor`, `threeFlatland.normalBaker.run`.

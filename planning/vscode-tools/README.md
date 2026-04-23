# three-flatland Editor Tools

Official three-flatland tools for content authoring inside editor hosts (VSCode, Cursor, Antigravity — any host that implements the VSCode extension API). Ships as a single VSIX with all platform Go binaries packed.

Not prefixed `vscode-` because the tools are portable across editor hosts. CLI tooling (slug-bake, flatland-bake normal, future bakers) lives separately in `packages/*` as part of the bake pipeline; `tools/*` is for editor integrations only.

## Documents

1. [suite-architecture.md](./suite-architecture.md) — toolchain, monorepo layout (`tools/*`), single-VSIX + packed binaries, ESM-only, Go sidecar strategy, SQLite cache.
2. [design-system.md](./design-system.md) — `@three-flatland/tools-design-system`. VSCode Elements + StyleX for custom components. Theme tokens, codicons.
3. [api-reference.md](./api-reference.md) — condensed VSCode API reference filtered to what this suite uses.
4. [tool-zzfx-studio.md](./tool-zzfx-studio.md) — ZzFX CodeLens + sound editor + `vscode.lm` generation. Go sidecar with tree-sitter + SQLite cache.
5. [tool-sprite-atlas.md](./tool-sprite-atlas.md) — CustomEditor over PNG/WebP/KTX2 sources, auto-slice, frame-duplication timing, R3F preview, JSON Schema validation.
6. [tool-normal-baker.md](./tool-normal-baker.md) — GUI wrapper around `packages/normals` + `packages/bake` from `lighting-stochastic-adoption` branch.
7. [tool-spark.md](./tool-spark.md) — PNG/WebP → KTX2/BasisU converter (right-click).
8. [schemas/README.md](./schemas/README.md) — JSON Schema authoring + test strategy.

## Shipping targets

| Tool | v0 | v1 |
|---|---|---|
| ZzFX Studio | Regex pre-filter + Go sidecar tree-sitter scan, play lens, manual-edit webview, SQLite cache | `vscode.lm` AI generation with category/style pills, variable-ref write-back, cross-file resolution |
| Sprite Atlas | Grid + CCL auto-slice, frame-duplication timeline, JSON Schema validation, PNG input | WebP + KTX2 inputs, `vscode.lm` naming assist, animation event markers |
| Normal Baker | GUI wrapper around `flatland-bake normal` — region editor, direction/pitch/elevation pickers | KTX2 output, multi-atlas batch |
| Spark (KTX2) | Right-click PNG/WebP → KTX2 with BasisU, preview, sidecar fallback metadata | Mipmap control, per-channel settings |
| Design System | VSCode Elements wrappers + StyleX custom primitives, ThemeProvider, codicons | Dialog, Toolbar composites, split pane |

## Decisions

- **One VSIX**, `@three-flatland/tools` from `tools/ext/`. Every tool contributes via `package.json` arrays. All platform Go binaries (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64) packed; resolve per-platform at activation.
- **ESM everywhere**. `engines.vscode: ^1.94.0` (extension host ESM landed in 1.94). No dual bundles.
- **Bundler**: esbuild (ESM, `external: ['vscode']`) for host; Vite + React 19 for webviews.
- **Go sidecars** for scanning/AST work. Pure-Go stack: tree-sitter via `github.com/tree-sitter/go-tree-sitter` (cgo) OR pure-Go alternative if cross-compile matrix pain outweighs. **Pure-Go SQLite** (`modernc.org/sqlite`) for per-project caches in `storageUri`.
- **Image formats for sprites**: PNG (v0), WebP (v1), KTX2/BasisU (v1). Loaders accept ordered fallback arrays; omitted array defaults to `[webp, png]` with dev-time warn.
- **Sidecar naming**: `foo.png` + `foo.atlas.json`; `foo.normal.png` + `foo.normal.json` (already convention on `lighting-stochastic-adoption`).
- **Timing model**: frames are duplicated on the timeline for holds, not per-frame durations. Timeline editor renders duplicates as held cells for quick 1→N hold adjustments.
- **JSON Schemas**: every sidecar format has a JSON Schema under `tools/io/schemas/`. Ajv-validated at write and in unit tests.
- **Design system styling**: StyleX for custom primitives. VSCode Elements (Lit) for composed components.
- **ZzFX plugin portability**: may later migrate to its own `zzfx-studio` repo. The `tools/codelens-service/` shared package is what's portable.

## Three-flatland gaps

Filed against the main project (not this suite):

- `SpriteSheetLoader` / `TextureLoader` should accept an ordered `formats: ['ktx2', 'webp', 'png']` fallback option; default to `['webp', 'png']` with a dev-time warn when KTX2 requested and unavailable.
- `Sprite2DMaterial` needs a normal-map channel (pending `lighting-stochastic-adoption` merge, which ships the consumer-side work alongside `packages/normals`).
- `SpriteSheetLoader` should read `meta.normal` + `meta.animations` from sidecar so editor output is single-call consumable.

## Worktree

This plan lives in `~/.claude/worktrees/vscode-tools` on branch `feat-vscode-tools`.

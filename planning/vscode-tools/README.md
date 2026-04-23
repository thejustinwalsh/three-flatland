# three-flatland Editor Tools

Official three-flatland tools for content authoring inside editor hosts (VSCode, Cursor, Antigravity — any host that implements the VSCode extension API). Ships as a single VSIX with all platform Go binaries packed.

Not prefixed `vscode-` because the tools are portable across editor hosts. CLI tooling (slug-bake, flatland-bake normal, flatland-bake encode, future bakers) lives in `packages/*` as baker packages; `tools/*` GUIs are *thin wrappers* over those packages.

## Convention: baker package + thin GUI

Every tool that does real work (normals, image encoding, future atlas packing, texture compression, etc.) ships as a **baker package** in `packages/*`, following the shape of `packages/normals` + `packages/bake`. Each baker exports:

- **`.`** — browser-safe runtime (pure algorithms, loaders, types; no `node:*`).
- **`./node`** — re-exports `.` plus file-I/O wrappers (Node-only).
- **`./cli`** — default-exports a `Baker` (`{ name, description, run(args) }`) registered via `flatland.bake` in `package.json`; dispatched by `flatland-bake <name>`.

The VSCode tool (inside `tools/vscode/`) imports `@three-flatland/<baker>/node` for real work and `@three-flatland/<baker>` for browser-side helpers (previews, memory estimation, preview-mode decoding). **No encoding/baking logic ever lives in `tools/*`.** Three consumption paths — runtime, programmatic Node, CLI — share one implementation.

Prototype: `packages/normals` (commit `61a2c7b` on `lighting-stochastic-adoption`). Follow it for new bakers.

## Documents

1. [suite-architecture.md](./suite-architecture.md) — toolchain, monorepo layout (`tools/*`), single-VSIX + packed binaries, ESM-only, Go sidecar strategy, SQLite cache.
2. [design-system.md](./design-system.md) — `@three-flatland/design-system`. VSCode Elements + StyleX for custom components. Theme tokens, codicons.
3. [api-reference.md](./api-reference.md) — condensed VSCode API reference filtered to what this suite uses.
4. [tool-zzfx-studio.md](./tool-zzfx-studio.md) — ZzFX CodeLens + sound editor + `vscode.lm` generation. Go sidecar with tree-sitter + SQLite cache.
5. [tool-sprite-atlas.md](./tool-sprite-atlas.md) — CustomEditor over PNG/WebP/KTX2 sources, auto-slice, frame-duplication timing, R3F preview, JSON Schema validation.
6. [tool-normal-baker.md](./tool-normal-baker.md) — GUI wrapper around `packages/normals` + `packages/bake` from `lighting-stochastic-adoption` branch.
7. [tool-image-encoder.md](./tool-image-encoder.md) — Squoosh-style A/B image encoder (PNG ↔ WebP ↔ AVIF ↔ KTX2) with disk/RAM/GPU memory stats per runtime loader (`spark.js`, `KTX2Loader`, default).
8. [schemas/README.md](./schemas/README.md) — JSON Schema authoring + test strategy.

## Shipping targets

| Tool | Backing package | v0 | v1 |
|---|---|---|---|
| FL ZzFX Studio | (Go sidecar `tools/codelens-service/` — not a baker) | Regex pre-filter + tree-sitter scan, play lens, edit webview, SQLite cache | `vscode.lm` AI generation, variable-ref write-back |
| FL Sprite Atlas | (tool-owned v0; future: `packages/atlas` baker) | Grid + CCL auto-slice, frame-duplication timeline, JSON Schema validation, PNG input | WebP/AVIF/KTX2 inputs, naming assist, animation event markers |
| FL Normal Baker | `packages/normals` (exists on `lighting-stochastic-adoption`) | GUI wrapper around `flatland-bake normal` — region editor, direction/pitch/elevation pickers | KTX2 output, multi-atlas batch |
| FL Image Encoder | `packages/image` (new baker) | GUI wrapper around `flatland-bake encode` — PNG/WebP/AVIF/KTX2 A/B with disk/RAM/GPU memory per loader | Per-channel settings, batch mode in GUI, delta overlay |
| Design System | `tools/design-system` (shared) | VSCode Elements wrappers + StyleX primitives, ThemeProvider, codicons | Dialog, Toolbar composites, split pane |

## Branding — FL

All user-facing command titles carry the **FL** prefix (`Open in FL Image Encoder`, `Open in FL Sprite Atlas`, `Open in FL Normal Baker`). Every command registers `"category": "FL"` so command-palette entries appear as `FL: <title>`. Inline CodeLens titles stay compact (`▶ Play`, `⚙ Edit`) — the surrounding code is enough context; the FL prefix would be noise.

Rationale: the suite spans many separate menus (explorer context, palette, editor title, custom editor picker, code action). Users need to recognize our tools at a glance without a lookup.

## Decisions

- **One VSIX**, `@three-flatland/vscode` from `tools/vscode/`. Every tool contributes via `package.json` arrays. All platform Go binaries (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64) packed; resolve per-platform at activation.
- **ESM everywhere**. `engines.vscode: ^1.94.0` (extension host ESM landed in 1.94). No dual bundles.
- **Bundler**: esbuild (ESM, `external: ['vscode']`) for host; Vite + React 19 for webviews.
- **Go sidecars** for scanning/AST work. Pure-Go stack: tree-sitter via `github.com/tree-sitter/go-tree-sitter` (cgo) OR pure-Go alternative if cross-compile matrix pain outweighs. **Pure-Go SQLite** (`modernc.org/sqlite`) for per-project caches in `storageUri`.
- **Image formats for sprites**: PNG (v0), WebP (v1), KTX2/BasisU (v1). WebP + `spark.js` is the headline path (smallest on disk and in GPU memory); KTX2 via three's `KTX2Loader` is the alternative. Loaders accept `{ formats, loader }` where `formats` is an ordered preference array and `loader` picks the runtime path (`'spark' | 'three-ktx' | 'three-default' | 'auto'`). Default: `formats: ['webp','png']`, `loader: 'auto'` with dev-time warn on missing requested format.
- **Sidecar naming**: `foo.png` + `foo.atlas.json`; `foo.normal.png` + `foo.normal.json` (already convention on `lighting-stochastic-adoption`).
- **Timing model**: frames are duplicated on the timeline for holds, not per-frame durations. Timeline editor renders duplicates as held cells for quick 1→N hold adjustments.
- **JSON Schemas**: colocated with format owners, not `tools/io/`. Atlas schema lives in `packages/three-flatland/src/sprites/`; normal-descriptor schema in `packages/normals/src/`. Each package exports `validate*` ajv functions. Docs site publishes to `https://three-flatland.dev/schemas/*`. See [schemas/README.md](./schemas/README.md).
- **Design system styling**: StyleX for custom primitives. VSCode Elements (Lit) for composed components.
- **ZzFX plugin portability**: may later migrate to its own `zzfx-studio` repo. The `tools/codelens-service/` shared package is what's portable.
- **Baker package pattern is required** for any tool that does real work (encoding, baking, indexing). Tool UIs in `tools/vscode/` never implement that work directly — they import it from a `packages/<name>` baker package with `.` / `./node` / `./cli` subpath exports and a `flatland.bake` manifest entry. Prototype: `packages/normals`.

## Three-flatland gaps

Filed against the main project (not this suite):

- `SpriteSheetLoader` / `TextureLoader` should accept `{ formats, loader }` — ordered format preference + runtime loader pick (`'spark' | 'three-ktx' | 'three-default' | 'auto'`). Default `formats: ['webp','png']`, `loader: 'auto'`. Dev-time warn when a requested format isn't present on disk.
- `Sprite2DMaterial` needs a normal-map channel (pending `lighting-stochastic-adoption` merge, which ships the consumer-side work alongside `packages/normals`).
- `SpriteSheetLoader` should read `meta.normal` + `meta.animations` from sidecar so editor output is single-call consumable.

## Worktree

This plan lives in `~/.claude/worktrees/vscode-tools` on branch `feat-vscode-tools`.

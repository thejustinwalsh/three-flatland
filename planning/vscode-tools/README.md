# three-flatland VSCode Tools

Internal VSCode extension suite for three-flatland content authoring. One VSIX, multiple tools, shared design system, shared Go service.

## Documents

1. [suite-architecture.md](./suite-architecture.md) — toolchain, monorepo layout, single-VSIX decision, Go sidecar, publishing strategy.
2. [design-system.md](./design-system.md) — `@three-flatland/vscode-design-system` package plan (VSCode Elements + React 19, theme tokens, codicons, gaps).
3. [api-reference.md](./api-reference.md) — condensed VSCode API reference filtered to what this suite actually uses.
4. [tool-zzfx-codelens.md](./tool-zzfx-codelens.md) — ZzFX CodeLens + sound editor webview + `vscode.lm` generation.
5. [tool-sprite-atlas-editor.md](./tool-sprite-atlas-editor.md) — PNG CustomEditor, auto-slice, R3F preview, sidecar schema.
6. [tool-normal-baker.md](./tool-normal-baker.md) — CLI + GUI wrapper, shared with atlas editor via `vscode-preview` and `vscode-io`.

## Ship targets (v0 → v1)

| Tool | v0 | v1 |
|---|---|---|
| ZzFX CodeLens | Regex-based detection, play lens, manual-edit webview | Go sidecar with tree-sitter, `vscode.lm` AI generation, write-back with formatter respect |
| Sprite Atlas Editor | Grid-slice + manual rects, frame naming, sidecar write | CCL auto-slice, animation timeline, `vscode.lm` naming assist |
| Normal Baker | Standalone CLI in `packages/normal-baker` | GUI webview reusing atlas preview components |
| Design System | VSCode Elements + React wrappers, theme provider, codicons | Missing primitives filled (Dialog, Toolbar composites) |

## Decisions

- **One VSIX** named `@three-flatland/vscode-tools` contributing every tool. See [suite-architecture.md § Packaging](./suite-architecture.md#packaging).
- **Go for infrastructure sidecars** (zzfx scanner, potentially atlas slicer). **TypeScript everywhere else** (extension host, all webviews, CLIs).
- **R3F previews** use `@react-three/fiber/webgpu` + `three-flatland` directly — no special adaptation layer.
- **Sidecar naming**: `foo.png` + `foo.atlas.json` + `foo.normal.png`. See [tool-sprite-atlas-editor.md § Sidecar schema](./tool-sprite-atlas-editor.md#sidecar-json-schema).
- **Host bundler**: esbuild (CJS, `external: ['vscode']`). **Webview bundler**: Vite + React 19. See [suite-architecture.md § Toolchain](./suite-architecture.md#toolchain).

## Three-flatland gaps surfaced by this effort

Filed as follow-ups against the main project, not this suite:

1. No normal-map support on `Sprite2DMaterial` or as a `MaterialEffect`. Normal baker produces assets the runtime can't yet consume. See [tool-normal-baker.md § Runtime gap](./tool-normal-baker.md#runtime-gap).
2. `SpriteSheetLoader` should read `meta.normal` and `meta.animations` from sidecar so the editor output is single-call consumable.
3. `packages/presets` is effectively empty. Nothing reusable yet.

## Worktree

This plan lives in worktree `~/.claude/worktrees/vscode-tools` on branch `feat-vscode-tools`.

# MVP: Sprite Atlas Tool

Goal: ship a minimum viable sprite atlas editor that validates the whole plugin foundation — extension host + custom editor + webview + three-flatland render + VSCode theme — so we can F5 and see it running in ~a day's work.

Rect editing, saving sidecars, auto-slice, timeline, and all the other atlas tool features are **out of scope for the MVP** and tracked separately.

## Success criteria

1. `pnpm --filter @three-flatland/vscode build` succeeds in the worktree.
2. F5 in VSCode launches the extension development host.
3. Right-click any `.png` in the Explorer → "Open in FL Sprite Atlas" appears.
4. Clicking it opens a CustomEditor pane.
5. The pane renders the image via three-flatland's `SpriteGroup` in an R3F Canvas.
6. VSCode theme colors flow into the webview chrome (toolbar, status strip) — verify light, dark, high-contrast.
7. Command palette entry `FL: Open Sprite Atlas` exists and opens the active PNG.

## Scope (what's in v0)

- Shared packages (skeletons, enough surface to compile): `design-system`, `bridge`, `preview`, `io`.
- `@three-flatland/vscode` extension: `activate`, context-menu contribution, `AtlasCustomEditorProvider`, webview HTML composer with CSP + nonce + import-map stub.
- Webview app: React 19 root, toolbar (inline-styled, StyleX wiring can come next), canvas via `@react-three/fiber/webgpu` rendering `SpriteGroup` with the opened PNG.
- Theme: pull colors from `--vscode-*` CSS vars in the design-system's token file; verify on theme switch.
- Host↔webview bridge: typed message channel; one message `atlas/imageReady` with `{ uri, width, height }` at v0.

## Out of scope (deferred)

- Rect/animation editing, save, sidecar schema validation.
- Auto-slice (grid, CCL).
- `vscode.lm` AI assist.
- KTX2 / WebP / AVIF source formats (PNG only at v0).
- Normal-map preview.
- Workspace package-version resolution (bundled three-flatland only). See **Workspace-version resolver** below for the design we'll land post-MVP.

## Package layout (created this pass)

```
tools/
  vscode/                 # @three-flatland/vscode — the VSIX
    package.json
    esbuild.config.mjs    # host bundle (ESM, external: vscode)
    vite.config.ts        # webview bundles via @tomjs/vite-plugin-vscode
    tsconfig.json
    src/
      extension.ts        # activate/deactivate, wire up tools
      tools/atlas/
        provider.ts       # AtlasCustomEditorProvider
        html.ts           # composes the webview HTML (CSP, nonce, importmap)
        webview/
          main.tsx        # React root entry (Vite entry)
          App.tsx         # toolbar + canvas + bridge wiring
    .vscode/
      launch.json         # Extension Development Host launch
      tasks.json          # composite watch task

  design-system/          # @three-flatland/design-system
    package.json
    tsconfig.json
    tsup.config.ts
    src/
      index.ts
      tokens.ts           # --vscode-* var helpers; StyleX slot for later
      theme/useThemeKind.ts
      primitives/
        Button.tsx
        Panel.tsx
        Toolbar.tsx

  bridge/                 # @three-flatland/bridge
    package.json
    tsconfig.json
    tsup.config.ts
    src/
      index.ts
      host.ts             # createHostBridge(webview, handlers)
      client.ts           # createClientBridge(schema)
      types.ts            # RPC envelope types

  io/                     # @three-flatland/io
    package.json
    tsconfig.json
    tsup.config.ts
    src/
      index.ts
      image.ts            # loadImageBytes, decodeToImageData
      fixtures.ts         # loadFixture helper (schema test harness stub)

  preview/                # @three-flatland/preview
    package.json
    tsconfig.json
    tsup.config.ts
    src/
      index.ts
      SpritePreview.tsx   # R3F Canvas + three-flatland SpriteGroup
      useTextureFromUri.ts
```

## Build / run

- `pnpm install` at repo root.
- `pnpm -r --filter "./tools/*" build` — all shared packages.
- `pnpm --filter @three-flatland/vscode build` — extension + webview bundles.
- F5 in VSCode with the extension opened as the workspace root, or via the launch config.

## Task breakdown

- [ ] **T1** — Write `pnpm-workspace.yaml` addition (done earlier), confirm `tools/*` captured.
- [ ] **T2** — Scaffold `tools/design-system` with minimal `Button`/`Panel`/`Toolbar` and CSS-var-based tokens.
- [ ] **T3** — Scaffold `tools/bridge` with typed RPC helpers.
- [ ] **T4** — Scaffold `tools/io` with image load + fixture helper stubs.
- [ ] **T5** — Scaffold `tools/preview` with `SpritePreview` using existing `SpriteGroup` from three-flatland.
- [ ] **T6** — Scaffold `tools/vscode` — `package.json` contributions (commands + menus + customEditors), esbuild + Vite configs, `.vscode/launch.json` + `tasks.json`.
- [ ] **T7** — Implement `AtlasCustomEditorProvider` — opens webview, resolves image URI via `asWebviewUri`, composes HTML with CSP nonce.
- [ ] **T8** — Implement webview React app — toolbar + canvas rendering `<SpritePreview>`.
- [ ] **T9** — `pnpm install` + build each package; fix any type errors.
- [ ] **T10** — F5 launch → verify context menu, open editor, see image rendered via three-flatland.

---

## Workspace-version resolver (post-MVP design)

Goal: the atlas editor (and every tool with a preview) renders with *the same version of three-flatland (and its peer deps) the user has installed in their workspace*. Fall back to the version bundled in the VSIX only when workspace resolution fails — and when that happens, surface it subtly so the user can investigate if something looks off.

**No CDN.** Two sources only: workspace or bundled. Both resolved through the same import-map mechanism.

### Design

1. **Host-side probe.** At custom-editor activation, extension host walks the workspace root looking for:
   - `node_modules/three-flatland/package.json` — record `version`, `module` entry.
   - `node_modules/three/package.json` — same.
   - `node_modules/@react-three/fiber/package.json` — same.
   - Any transitive peer dep that's in our webview bundle's import graph.

2. **Convert to webview URIs.** For each resolved package, resolve the main ESM entry point to an absolute filesystem path, then `webview.asWebviewUri(vscode.Uri.file(entryPath))` → a `vscode-webview://` URL usable inside the webview.

3. **Import map.** Extension host composes an import map and injects it as the *first* `<script type="importmap">` in the webview HTML:

   ```html
   <script type="importmap" nonce="${nonce}">
   {
     "imports": {
       "three-flatland":            "${workspaceThreeFlatlandUri}",
       "three":                     "${workspaceThreeUri}",
       "@react-three/fiber":        "${workspaceR3FUri}",
       "@react-three/fiber/webgpu": "${workspaceR3FWebgpuUri}"
     }
   }
   </script>
   ```

4. **Bundle externals.** Vite build for the webview sets `build.rollupOptions.external: ['three-flatland', 'three', '@react-three/fiber', '@react-three/fiber/webgpu']`. Our webview bundle imports them as bare specifiers; at runtime browser native ESM resolves via the injected import map.

5. **Fallback.** When a workspace resolution fails (package absent, unreadable, version incompatible, non-file URI scheme, transitive bare specifier that can't be mapped), the extension host emits the map entry pointing at the **bundled** copy shipped inside `tools/vscode/dist/webview/bundled/`. The bundled copy is produced by a separate Vite build that inlines all of three-flatland + three + r3f. The host picks per-package whether to use workspace or bundled, and records the outcome in a resolution report passed to the webview over the bridge.

### Fallback indicator (UI)

The webview never surfaces version information during happy-path operation. It only surfaces state when at least one package fell back to bundled.

- A subtle icon (warning codicon, muted color) appears in the corner of the toolbar — no badge count, no loud color.
- Click → small popover lists each fallback:
  ```
  three-flatland   bundled (0.1.0-alpha.4)    expected from workspace (not installed)
  three            workspace 0.183.1
  @react-three/fiber   bundled (10.0.0-alpha.2)  expected 10.0.0-alpha.2 (read failed: EACCES)
  ```
- "Copy report" button in the popover for bug reports.
- When every package resolves cleanly, the indicator is invisible — no icon, no prompt, nothing.

Component: `<FallbackIndicator report={...} />` in `@three-flatland/design-system`. Every tool that uses the resolver renders it in the toolbar; the resolver pushes the report over the bridge once.

### Edge cases

- **Deep sub-path imports (`three/examples/jsm/...`)**: import map supports prefix remapping via trailing `/`. Add `"three/": "${workspaceThreeRootUri}/"` alongside the main entry.
- **Version skew** (workspace is older than our tool assumes): we don't validate; if it breaks, user sees a webview error and we log a warn. Future: consult a min-version manifest per tool and refuse to resolve below it.
- **Monorepo / workspace-protocol links**: `node_modules/three-flatland` may be a symlink into `packages/three-flatland/`. Follow the symlink, use the real path. Same conversion to webview URI.
- **Remote / virtual workspaces**: `workspace.fs` may not expose a real filesystem. Detect via `uri.scheme !== 'file'` and fall back to bundled, noted in the indicator.
- **Transitive bare imports**: if the workspace three-flatland does `import 'koota'` internally, `koota` also needs an import map entry. Walk transitively; if any transitive dep can't be resolved, fall back the parent package to bundled.

### Why no CDN

- No network dependency at runtime (offline workspaces + air-gapped setups).
- No CSP relaxation (`script-src 'self'` stays tight).
- No service reliability risk (esm.sh / unpkg outages).
- Byte-for-byte match with the user's installed version — if they have a patched or workspace-linked copy, that's exactly what renders in the tool.

Bundled-only is the MVP default. Workspace resolution + fallback indicator is the Phase 2 upgrade. Both paths converge on the same import-map mechanism.

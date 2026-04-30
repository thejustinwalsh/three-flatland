# @three-flatland/vscode

Agent-facing onboarding for the VSCode extension. Read once before adding or modifying a tool.

## Architecture

- **Extension host** (Node/esbuild): `extension/` — registers commands, editors, reads/writes the filesystem, talks to the webview via bridge.
- **Webviews** (browser/Vite+React): `webview/<tool>/` — renders the UI. Each tool's directory is auto-discovered; no Vite config edit needed.
- **Bridge** (`@three-flatland/bridge`): typed message-passing between the two sides. Host uses `createHostBridge(webview)`, client uses `createClientBridge()`.
- **Design system** (`@three-flatland/design-system`): all VSCode-themed chrome. Raw HTML elements are forbidden.

Build outputs: `dist/extension.js` (host) + `dist/webview/<tool>/index.html` (webviews).

## Adding a new tool

### 1 — Host side: `extension/tools/<name>/`

```ts
// register.ts — wire into the extension context
export function registerMyTool(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('threeFlatland.myTool.open',
      async (clicked?: vscode.Uri, allSelected?: vscode.Uri[]) => {
        await openMyPanel(context, /* … */)
      }
    )
  )
}

// host.ts — create panel + bridge
export async function openMyPanel(context: vscode.ExtensionContext, …): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'threeFlatland.myTool', 'My Tool', vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')] }
  )
  panel.webview.html = await composeToolHtml({ webview: panel.webview, tool: 'myTool',
    extensionUri: context.extensionUri })
  const bridge = createHostBridge(panel.webview)
  bridge.on('myTool/ready', async () => { bridge.emit('myTool/init', { … }); return { ok: true } })
  const disposeReload = setupDevReload(context.extensionUri, 'myTool',
    () => bridge.emit('dev/reload', { tool: 'myTool' }))
  bridge.on('dev/reload-request', async () => { panel.webview.html = await renderHtml(); return { ok: true } })
  panel.onDidDispose(() => { disposeReload.dispose(); bridge.dispose() })
}
```

### 2 — Webview side: `webview/<name>/`

Copy `webview/merge/` as a starting point. Required files:

- `index.html` — FOUC-guard shell (copy verbatim from merge or atlas; only change `<title>`).
- `main.tsx` — boots React, sets up codicon tag, error forwarding, dev-reload listener. Copy merge's `main.tsx`.
- `App.tsx` — your React tree. Import only design-system primitives for chrome.

Vite auto-discovers `webview/<name>/index.html`. No config change needed.

### 3 — `package.json` contributes

```json
"commands": [{ "command": "threeFlatland.myTool.open", "title": "Do the thing", "category": "FL" }],
"menus": {
  "explorer/context": [{ "command": "threeFlatland.myTool.open", "when": "resourceExtname == .ext", "group": "navigation@12" }],
  "commandPalette": [{ "command": "threeFlatland.myTool.open", "when": "resourceExtname == .ext" }]
}
```

For a file-backed editor add a `customEditors` entry (see atlas pattern below). For a new sidecar file type add `languages` + `grammars`.

### 4 — `extension/index.ts`

```ts
import { registerMyTool } from './tools/myTool/register'
// inside activate():
registerMyTool(context)
```

## Two patterns: custom editor vs ad-hoc command

| | Custom editor (atlas) | Ad-hoc command (merge) |
|---|---|---|
| Activation | User opens a file (e.g. `*.png`) via "Reopen With…" | Command palette / explorer context menu |
| Registration | `vscode.window.registerCustomEditorProvider` | `vscode.commands.registerCommand` |
| Panel creation | VSCode calls `resolveCustomEditor(document, panel)` | You call `vscode.window.createWebviewPanel(…)` |
| Multi-select | Not applicable | Handler signature `(clicked?, allSelected?)` — filter by `allSelected` first |
| `package.json` | `customEditors` + `commands` + `menus` | `commands` + `menus` only |
| Reference | `extension/tools/atlas/{register,provider}.ts` | `extension/tools/merge/{register,host}.ts` |

**Pick custom editor** when the tool is the primary viewer for a file type. Pick **ad-hoc command** for everything else.

## webview-host helpers (`extension/webview-host.ts`)

### `composeToolHtml({ webview, tool, extensionUri, injectCode? })`

- Reads `dist/webview/<tool>/index.html` from disk.
- Replaces `%FL_BASE%` tokens with the panel's `vscode-webview://` URI (Vite emits `../assets/…`; token resolves against `dist/webview/`).
- Strips `crossorigin` attributes.
- Injects a per-render nonce on every `<script>` tag, including any inline `<script>` in `injectCode`.
- Inserts the CSP `<meta>` with `script-src 'nonce-…'`, `img-src`, `worker-src blob:`, `connect-src`, `wasm-unsafe-eval`.
- To seed the webview with host-side data use `injectCode`:
  ```ts
  injectCode: `<script>window.__FL_MYTOOL__ = ${JSON.stringify(payload)};</script>`
  ```

### `setupDevReload(extensionUri, tool, onReload, debounceMs?)`

Watches `dist/webview/**/*` with VSCode's file-system watcher (survives Vite wiping the dir). Debounces 150 ms. Returns a `Disposable` — call `.dispose()` in `panel.onDidDispose`. In the callback, emit `'dev/reload'` over the bridge; the webview surfaces a toast; clicking Reload sends `'dev/reload-request'` back and you re-render `panel.webview.html`.

## Bridge handshake convention

```
webview boots → bridge.request('<tool>/ready')
host responds → bridge.emit('<tool>/init', { …payload… })
```

Subsequent messages follow `<tool>/<verb>` naming. Webview sends requests; host responds with `{ ok: true }` or throws to surface an error.

Key rules (see `tools/bridge/` source):
- `createHostBridge(webview)` — host side. `bridge.on(method, handler)` where handler returns a value or throws.
- `createClientBridge()` — webview side. `bridge.request(method, params?)` returns a Promise.
- `bridge.on(event, handler)` returns an **unsubscribe function** — there is no `dispose()` on `on()`. Capture it if you need to cancel a specific listener.
- `bridge.dispose()` disposes the entire bridge; call it in `panel.onDidDispose`.
- Both sides share `'dev/reload'` (host → webview) and `'dev/reload-request'` (webview → host) for the live-reload flow.
- Forward webview console output via `'client/log'` (already in the main.tsx template).

## Webview UI: design-system primitives are mandatory

Do NOT write raw `<button>`, `<select>`, `<input>`, `<details>` for VSCode chrome. Every interactive element must come from `@three-flatland/design-system`.

| Need | Primitive |
|---|---|
| Top toolbar | `Toolbar` + `ToolbarButton` (icon + title) |
| Titled section / card | `Panel` (props: `title`, `headerActions`, `bodyPadding`) |
| Tabs | `Tabs` + `TabHeader` + `TabPanel` |
| Dropdown | `CompactSelect` or `SingleSelect` + `Option` |
| Number input | `NumberField` |
| Checkbox | `Checkbox` |
| Text input | `TextField` |
| Collapsible section | `Collapsible` |
| Icon | `Icon` (codicon name string) |
| Inline error | StyleX with `vscode.errorBg` / `vscode.errorFg` / `vscode.errorBorder` tokens |

For an artboard / canvas surface (custom rendering, SVG, Three.js canvas) — handcraft the surface, but wrap it in `<Panel bodyPadding="none">`.

See `tools/design-system/src/index.ts` for the full export list.

## StyleX token discipline

Always import tokens from the subpath — not from the barrel:

```ts
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
```

The StyleX Babel plugin cannot follow `defineVars` through re-exports. Importing from the root barrel breaks static analysis.

Do NOT write `style={{ background: 'var(--vscode-…)' }}`. Use `vscode.*` tokens in StyleX. Small pixel-value layout offsets via inline `style={{}}` are acceptable; theme colors must go through tokens.

## CSP + asset URL rules

- `composeToolHtml` sets the CSP. Do not set a second CSP meta in `index.html`.
- `localResourceRoots` on the panel must include `dist/` and every directory the webview needs to load resources from (e.g. the document's parent dir for images).
- Asset URLs in `index.html` use `%FL_BASE%` tokens emitted by the Vite `tokenizeAssetBase` plugin. `composeToolHtml` substitutes them at render time. Do not bypass this mechanism.

## Bundle size & loading

The atlas tool is the reference. Apply the same patterns to any tool that pulls in heavy chunks (Three.js, R3F, large React subtrees).

### Code-split heavy work

- Anything that imports `@react-three/fiber` / `three` / `three-flatland` MUST be loaded via `@three-flatland/preview/canvas` (the heavy subpath), not the root `@three-flatland/preview`. Keeps the initial shell chunk small.
- Wrap canvas components with `React.lazy(...)` so they ship in a separate chunk:

```tsx
const CanvasStage = lazy(() =>
  import('@three-flatland/preview/canvas').then((m) => ({ default: m.CanvasStage })),
)
const AnimationPreviewPip = lazy(() =>
  import('@three-flatland/preview/canvas').then((m) => ({ default: m.AnimationPreviewPip })),
)
```

Vite's runtime dedupes by URL — multiple `lazy()` calls against the same module reuse one network roundtrip and one resolved chunk.

### Warm the chunk in `main.tsx`

So the canvas chunk fetch overlaps with the initial shell render rather than waiting for the `<Suspense>` boundary to mount, kick off a fire-and-forget import in the entry:

```ts
// tools/vscode/webview/<tool>/main.tsx
import { App } from './App'
void import('@three-flatland/preview/canvas')   // warm the lazy chunk
```

This is purely a performance prefetch. `React.lazy()` inside `App` resolves from the same in-flight promise.

### Two Suspense boundaries

- **Root boundary** in `main.tsx` — covers the whole tree before React mounts. Fallback should be cheap (a spinner or empty themed div).

  ```tsx
  createRoot(root).render(
    <StrictMode>
      <Suspense fallback={<vscode-progress-ring />}>
        <App />
      </Suspense>
    </StrictMode>
  )
  ```

- **Inner boundary** at the canvas mount — fallback must look identical to the eventual rendered surface. Otherwise the user sees a brief unthemed flash when the lazy chunk swaps in. Atlas reuses `canvasBackgroundStyle()` for this so the placeholder bg matches CanvasStage's bg exactly.

### FOUC guard in `index.html`

The webview's `index.html` paints a themed background **before** the JS bundle parses, using inline CSS that mirrors the StyleX `vscode.bg/fg/fontFamily/fontSize` tokens:

```html
<style>
  html, body, #root { margin: 0; padding: 0; height: 100%; overflow: hidden; }
  body {
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }
</style>
```

Copy this verbatim into a new tool's `index.html`. Without it the user sees a white flash on first paint.

### Subpath imports for tree-shaking

`@vscode-elements/react-elements` has an ambiguous `sideEffects` field; importing from its barrel forces every component into the bundle. The design system already re-exports each component from its dedicated subpath, so consumers should always import primitives from `@three-flatland/design-system` (the barrel here is safe). For raw `<vscode-*>` web components used as JSX intrinsics in `main.tsx`, import the registration side-effect from the dedicated subpath:

```ts
import '@vscode-elements/elements/dist/vscode-progress-ring/index.js'
```

Never `import '@vscode-elements/elements'`.

### Codicon CSS

Codicons must be loaded via:

```ts
import '@vscode/codicons/dist/codicon.css'
```

The `tagCodiconStylesheet()` helper in atlas's main.tsx tags the emitted `<link>` so `<Icon>` can mirror the font rules into each Lit shadow root.

### Inspect bundle output

After `pnpm --filter @three-flatland/vscode build`, check the printed sizes:

- `dist/webview/<tool>/index.html` — should be ~1 KB
- `dist/webview/assets/<tool>-<hash>.js` — should be < 30 KB for the shell
- `dist/webview/assets/canvas-<hash>.js` — heavy chunk, only loaded by tools that lazy-import it

If a tool's shell chunk balloons, search for an accidental top-level import of `@three-flatland/preview/canvas`, `three`, or `@react-three/fiber`.

## State persistence

Use `webviewStorage` (`webview/state/webviewStorage.ts`) as the Zustand `persist` storage adapter. It wraps VSCode's `acquireVsCodeApi().getState/setState` so state survives panel reloads and tab focus loss (when `retainContextWhenHidden: true`). State is lost when the panel is disposed.

For undo/redo, layer `zundo` on top. See `webview/atlas/atlasStore.ts` and `webview/merge/mergeStore.ts`.

## `package.json` contributes reference

- `commands` — id must be `threeFlatland.<tool>.<action>`, `category` must be `"FL"`.
- `customEditors` — file-backed editors only. Set `"priority": "option"` so the default editor still works.
- `menus.explorer/context` — use `when` to match the file pattern; `group` string like `"navigation@10"` controls ordering.
- `menus.commandPalette` — gate commands behind a `when` clause to avoid polluting the palette.
- `languages` + `grammars` — for sidecar file types (`*.atlas.json` → `fl-atlas`). Provide `icons` entries if you have SVG icons.

## Common gotchas

- **Never** `git add -A` / `git add .` — this branch has WIP across many packages. Stage by exact path.
- `bridge.on()` returns an unsubscribe function, not a Disposable. There is no `bridge.on(…).dispose()`.
- `retainContextWhenHidden: true` is the default on all panels here. Flipping it to `false` resets all webview state on tab focus loss — use `webviewStorage` instead of fighting it.
- Vite auto-discovers `webview/<tool>/index.html` — no `vite.config.ts` edit needed.
- `composeToolHtml` may return a placeholder HTML page if the bundle is missing (not built yet). Run `pnpm --filter @three-flatland/vscode build` first.
- `crossorigin` attributes are stripped from the HTML by `composeToolHtml` — don't rely on them.
- The `%FL_BASE%` token resolves against `dist/webview/` (the shared root), not the tool subdir — Vite emits `../assets/…` paths that traverse up from the tool subdir.

## Reference tools

| Tool | Pattern | Location | When to reference |
|---|---|---|---|
| **atlas** | Custom editor on `*.png` | `extension/tools/atlas/` + `webview/atlas/` | Complex UI: sidebar + canvas + animation drawer; sidecar read/write |
| **merge** | Ad-hoc command + multi-select | `extension/tools/merge/` + `webview/merge/` | Starting point for any new tool — simpler, cleaner scaffolding |

For bridge API contracts see `tools/bridge/src/`.
For design-system primitive inventory see `tools/design-system/src/index.ts`.

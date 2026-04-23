# VSCode API Reference (suite-scoped)

Dense reference filtered to what this suite uses. Keep open while implementing.

## CodeLensProvider

Register with `vscode.languages.registerCodeLensProvider(selector, provider)`. Provider returns `CodeLens[]` from `provideCodeLenses(document, token)`; VSCode calls `resolveCodeLens(lens, token)` lazily for visible lenses.

- **Always defer command/title computation to `resolveCodeLens`**. Return only `range` in `provideCodeLenses`. Biggest perf win.
- Re-invocation triggers: document change, cursor idle, scroll, and `onDidChangeCodeLenses` event.
- Debounce `onDidChangeCodeLenses` to 250–500 ms against `onDidChangeTextDocument`.
- Honor `CancellationToken` in both methods.
- Known quirk (microsoft/vscode#112374): lenses may not appear until first click — don't gate initial `provideCodeLenses` on async work.

## WebviewPanel vs CustomEditorProvider

| | WebviewPanel | CustomEditorProvider |
|---|---|---|
| Trigger | imperative (`createWebviewPanel`) | user opens a matching file |
| Doc binding | none | one URI per instance |
| Flavors | — | `CustomTextEditor`, `CustomReadonlyEditor`, `CustomEditor` (binary + editable) |
| Dirty state | manual | `onDidChangeCustomDocument` event |
| Use case | ZzFX editor (opened from CodeLens command) | Atlas editor (opened from explorer on `.png`) |

Register custom editor:

```ts
context.subscriptions.push(
  vscode.window.registerCustomEditorProvider(
    'threeFlatland.atlas',
    new AtlasEditorProvider(context),
    { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: false } }
  )
)
```

And in `package.json`:

```json
"contributes.customEditors": [
  {
    "viewType": "threeFlatland.atlas",
    "displayName": "three-flatland Sprite Atlas",
    "selector": [{ "filenamePattern": "*.png" }],
    "priority": "option"
  }
]
```

`priority: "option"` leaves VSCode's built-in image viewer as default; our editor is opened via "Reopen Editor With…" or our explorer command.

### Webview messaging

- Extension → webview: `webview.postMessage(obj)`. Page listens `window.addEventListener('message', e => …)`.
- Webview → extension: `const api = acquireVsCodeApi(); api.postMessage(obj)`. Extension listens `webview.onDidReceiveMessage`.
- `acquireVsCodeApi()` may only be called once per page.

### Assets + CSP

```ts
webview.options = {
  enableScripts: true,
  localResourceRoots: [
    vscode.Uri.joinPath(context.extensionUri, 'dist'),
    workspaceRootUri,                  // if webview needs workspace files
  ],
}
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'atlas', 'index.js')
)
```

CSP template:

```
default-src 'none';
img-src ${webview.cspSource} https: data: blob:;
media-src ${webview.cspSource} blob:;
script-src 'nonce-${nonce}';
style-src ${webview.cspSource} 'unsafe-inline';
font-src ${webview.cspSource};
connect-src ${webview.cspSource};
```

Generate fresh nonce per render.

### State

- `retainContextWhenHidden: true` = DOM alive when backgrounded. Memory cost. Avoid for atlas editor (R3F canvas); allow for zzfx editor (trivial).
- `acquireVsCodeApi().setState/getState` for cheap persistence across tab-hide/reload.
- For panel resurrection after VSCode restart, register `WebviewPanelSerializer` + add `onWebviewPanel:<viewType>` to `activationEvents`.

## Language Model API (`vscode.lm`)

```ts
const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' })
if (!model) throw new Error('No Copilot chat model available')

const messages = [
  vscode.LanguageModelChatMessage.User(systemPrompt + '\n\n' + userPrompt),
]
const response = await model.sendRequest(messages, {}, token)
let buffer = ''
for await (const chunk of response.text) buffer += chunk
```

- Extension does NOT supply API keys. Piggybacks on the user's signed-in Copilot.
- First call triggers **per-extension consent prompt**.
- Quotas as of April 2026: shared with user's Copilot usage — ~50 premium chat requests/month (free tier), 2000 completions. Premium SKU tightening took effect 2026-04-20.
- Errors: `LanguageModelError` with `.code` in `NoPermissions | Blocked | NotFound | QuotaExceeded`.
- **No native structured-output / JSON-schema mode.** Parse output yourself, retry on parse failure.
- **Image inputs** supported via `LanguageModelImagePart` on vision-capable models (`gpt-4o`, `claude-3.5-sonnet` via Copilot). Check `model.capabilities` before relying on it.
- Tools: register via `contributes.languageModelTools`, implement `vscode.LanguageModelTool<TInput>`.

## Storage

| API | Scope | Type | Use |
|---|---|---|---|
| `context.workspaceState` | workspace | Memento (kv JSON) | small per-project prefs, last-used values |
| `context.globalState` | all | Memento (kv JSON) | user prefs; `setKeysForSync(keys)` for Settings Sync |
| `context.storageUri` | workspace | `Uri` (dir) | caches, indexes. **Can be `undefined` if no folder open** |
| `context.globalStorageUri` | all | `Uri` (dir) | downloaded binaries, LM cache. always defined |
| `context.secrets` | all | `SecretStorage` (async kv) | OS keyring; never in mementos |

Use `vscode.workspace.fs` (not Node `fs`) against URIs so remote/virtual workspaces work.

## File watching + workspace

- `workspace.findFiles(include, exclude?, maxResults?, token?)` — pass `maxResults` for large repos. Exclude `**/node_modules/**`.
- `onDidOpenTextDocument` fires for non-file schemes too (output/git). Filter `doc.uri.scheme === 'file'`.
- `onDidChangeTextDocument` fires per keystroke AND on dirty-state changes. **Always debounce**, keyed by `doc.uri.toString()`.
- `onDidSaveTextDocument` for disk-read safe points.
- `createFileSystemWatcher(glob)` — use glob, never bare filename. Stale-read bug (#72831): `onDidChange` may precede the disk write being flushed; guard with `setImmediate`.

## Explorer context menu

```json
"contributes.menus": {
  "explorer/context": [
    {
      "command": "threeFlatland.atlas.openEditor",
      "when": "resourceExtname == .png",
      "group": "navigation@10"
    }
  ]
}
```

`when` keys: `resourceExtname` (includes dot), `resourceFilename`, `resourceScheme`, `resourceLangId`, `explorerResourceIsFolder`. Operators: `==`, `!=`, `=~` (regex), `&&`, `||`, `!`, `in`.

Groups (numeric sort): `navigation`, `1_modification`, `7_modification`, etc. Intra-group order via `@N`.

## Theme detection

- Host: `vscode.window.activeColorTheme.kind` (`Light=1`, `Dark=2`, `HighContrast=3`, `HighContrastLight=4`). Subscribe `window.onDidChangeActiveColorTheme`.
- Webview: `document.body` class (`vscode-light|dark|high-contrast|high-contrast-light`) + `--vscode-*` CSS vars auto-injected and live-updated.

## Sidecar Go binary

- **Layout**: `resources/bin/<platform>-<arch>/<name>[.exe]`. Resolve at activation with `path.join(context.extensionPath, 'resources', 'bin', `${process.platform}-${process.arch}`, 'tool')`. Mark `chmod +x` in CI.
- **Packaging**: one VSIX per target via `vsce package --target <id>`. Targets: `win32-x64`, `win32-arm64`, `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, `linux-armhf`, `alpine-x64`, `alpine-arm64`, `web`. Requires `engines.vscode >= 1.61`.
- **Spawn**: `child_process.spawn(bin, args, { stdio: ['pipe','pipe','pipe'] })`. **Never** `stdio: 'inherit'` (crashes host — #138036). Route stderr to `OutputChannel`.
- **IPC**: stdio JSON-RPC via `vscode-jsonrpc` — `createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin))`. LSP framing for free.
- **Cleanup**: `context.subscriptions.push({ dispose: () => child.kill() })`.

## Commands + contributions

```json
"contributes": {
  "commands": [
    {
      "command": "threeFlatland.zzfx.playAtCursor",
      "title": "Play ZzFX Sound at Cursor",
      "category": "three-flatland",
      "icon": "$(play)",
      "enablement": "editorLangId in threeFlatland.jsLangs"
    }
  ],
  "menus": {
    "commandPalette": [
      { "command": "threeFlatland.zzfx.playAtCursor", "when": "editorLangId in threeFlatland.jsLangs" }
    ]
  },
  "configuration": {
    "title": "three-flatland Tools",
    "properties": {
      "threeFlatland.zzfx.enabled": {
        "type": "boolean",
        "default": true,
        "scope": "window"
      }
    }
  }
}
```

Register handlers via `vscode.commands.registerCommand(id, handler)` and push into `context.subscriptions`. Every command is palette-visible unless a `commandPalette` entry with `"when": "false"` hides it.

Read settings: `vscode.workspace.getConfiguration('threeFlatland').get<boolean>('zzfx.enabled')`. React: `workspace.onDidChangeConfiguration(e => e.affectsConfiguration('threeFlatland.zzfx'))`.

## Links

- [CodeLens sample](https://github.com/microsoft/vscode-extension-samples/tree/main/codelens-sample)
- [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)
- [when-clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts)
- [Contribution Points](https://code.visualstudio.com/api/references/contribution-points)
- [Publishing Extensions (targets)](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vscode-jsonrpc](https://www.npmjs.com/package/vscode-jsonrpc)

# Image Encoder Tool Implementation Plan (Phase 2.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VSCode webview that opens an image (PNG/WebP/AVIF) and lets the user A/B compare it against a re-encoded variant in WebP, AVIF, or KTX2. Live debounced encode, format-specific knobs, save alongside source.

**Architecture:** Ad-hoc command (merge-style) on `*.png` / `*.webp` / `*.avif`. Host reads source bytes and ships them to the webview via `encode/init`. Webview imports `@three-flatland/image` (browser path) and runs encode/decode locally. Zustand + zundo store mirroring merge's middleware shape.

**Tech Stack:** TypeScript, React, Vite, Zustand + zundo, `@three-flatland/design-system` primitives, `@three-flatland/image` (WebP via @jsquash, AVIF via @jsquash, KTX2 via Path B basis_encoder.wasm).

**Spec:** `planning/superpowers/specs/2026-05-02-image-encoder-tool-design.md`

---

## File map

**Created (extension host):**
- `tools/vscode/extension/tools/encode/register.ts`
- `tools/vscode/extension/tools/encode/host.ts`

**Modified (extension host):**
- `tools/vscode/extension/index.ts` — add `registerEncodeTool(context)`
- `tools/vscode/package.json` — add command, menus, ensure `@three-flatland/image` is reachable

**Created (webview):**
- `tools/vscode/webview/encode/index.html`
- `tools/vscode/webview/encode/main.tsx`
- `tools/vscode/webview/encode/App.tsx`
- `tools/vscode/webview/encode/encodeStore.ts`
- `tools/vscode/webview/encode/Toolbar.tsx`
- `tools/vscode/webview/encode/OriginalView.tsx`
- `tools/vscode/webview/encode/EncodedView.tsx`
- `tools/vscode/webview/encode/Knobs.tsx`

**Created (vendor passthrough):**
- Vite/extension config wiring so the webview can `fetch()` `@three-flatland/image`'s vendored wasm files (basis_encoder.wasm + @jsquash wasms). May be a copy step in the vscode tool's build, or a `localResourceRoots` addition. Discovered during Task 9 below.

---

## Phasing

1. **Host scaffolding** (Tasks 1–3): command, panel, bridge handshake. Webview is just a "Hello, encoder" stub.
2. **Webview shell + state** (Tasks 4–5): React tree, store, layout primitives wired up.
3. **Source decode + render** (Tasks 6–7): receive bytes, decode via @three-flatland/image, render to original canvas.
4. **Encode + render** (Tasks 8–10): live debounced encode pipeline, race-safe, write to encoded canvas.
5. **Knobs + save** (Tasks 11–12): format-specific UI, save flow.
6. **Polish + verify** (Tasks 13–15): undo/redo, error handling, build/test gate, gate report.

Each phase ends in a manually-verifiable state — F5 from the worktree should let you exercise the tool through the current phase.

---

## Phase 1 — Host scaffolding

### Task 1: Register command + package.json contributes

**Files:**
- Create: `tools/vscode/extension/tools/encode/register.ts`
- Modify: `tools/vscode/extension/index.ts`
- Modify: `tools/vscode/package.json`

- [ ] **Step 1: `register.ts`**

```ts
import * as vscode from 'vscode'
import { openEncodePanel } from './host'

export function registerEncodeTool(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.encode.open',
      async (clicked?: vscode.Uri, allSelected?: vscode.Uri[]) => {
        const candidates = allSelected && allSelected.length > 0 ? allSelected : clicked ? [clicked] : []
        const target = candidates[0] ?? vscode.window.activeTextEditor?.document.uri
        if (!target) {
          void vscode.window.showErrorMessage('FL Image Encoder: no file selected.')
          return
        }
        await openEncodePanel(context, target)
      },
    ),
  )
}
```

- [ ] **Step 2: Wire into `index.ts`**

In `tools/vscode/extension/index.ts`, add the import + call inside `activate(context)`:

```ts
import { registerEncodeTool } from './tools/encode/register'
// ...inside activate():
registerEncodeTool(context)
```

- [ ] **Step 3: `package.json` contributes**

Add to `contributes.commands`:

```json
{ "command": "threeFlatland.encode.open", "title": "Open Image Encoder", "category": "FL" }
```

Add to `contributes.menus.explorer/context`:

```json
{
  "command": "threeFlatland.encode.open",
  "when": "resourceExtname == .png || resourceExtname == .webp || resourceExtname == .avif",
  "group": "navigation@13"
}
```

Add to `contributes.menus.commandPalette`:

```json
{
  "command": "threeFlatland.encode.open",
  "when": "resourceExtname == .png || resourceExtname == .webp || resourceExtname == .avif"
}
```

Also add `@three-flatland/image` as a `dependencies` entry:

```json
"@three-flatland/image": "workspace:*"
```

- [ ] **Step 4: Stub `host.ts` so the import resolves**

Create `tools/vscode/extension/tools/encode/host.ts`:

```ts
import * as vscode from 'vscode'

export async function openEncodePanel(_context: vscode.ExtensionContext, _target: vscode.Uri): Promise<void> {
  void vscode.window.showInformationMessage('FL Image Encoder: TODO host panel')
}
```

(Real implementation is Task 2.)

- [ ] **Step 5: Build + verify**

```bash
cd /Users/tjw/.claude/worktrees/vscode-tools
pnpm --filter @three-flatland/vscode build 2>&1 | tail -10
```

Expect a clean build. (Webview build may complain about a missing `webview/encode/` — that's fine; we add it in Task 4.)

- [ ] **Step 6: Commit**

```bash
git add tools/vscode/extension/tools/encode/register.ts tools/vscode/extension/tools/encode/host.ts tools/vscode/extension/index.ts tools/vscode/package.json
git commit -m "feat(vscode): scaffold encode tool — command + stub host"
```

No `-A`. No Co-Authored-By line.

---

### Task 2: Real `host.ts` — panel, bridge, source-byte handoff

**Files:**
- Modify: `tools/vscode/extension/tools/encode/host.ts`

- [ ] **Step 1: Replace stub**

```ts
import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'

const TOOL = 'encode'
const MAX_BYTES = 16 * 1024 * 1024

export async function openEncodePanel(
  context: vscode.ExtensionContext,
  target: vscode.Uri,
): Promise<void> {
  const fileName = target.path.split('/').pop() ?? 'image'
  const fileExt = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (!['png', 'webp', 'avif'].includes(fileExt)) {
    void vscode.window.showErrorMessage(
      `FL Image Encoder: unsupported file extension .${fileExt}`,
    )
    return
  }

  const stat = await vscode.workspace.fs.stat(target).catch(() => null)
  if (!stat) {
    void vscode.window.showErrorMessage(`FL Image Encoder: cannot read ${fileName}`)
    return
  }
  if (stat.size > MAX_BYTES) {
    void vscode.window.showErrorMessage(
      `FL Image Encoder: ${fileName} is ${(stat.size / 1024 / 1024).toFixed(1)} MB; current limit is ${MAX_BYTES / 1024 / 1024} MB.`,
    )
    return
  }

  const sourceBytes = await vscode.workspace.fs.readFile(target)

  const panel = vscode.window.createWebviewPanel(
    'threeFlatland.encode',
    `Encode: ${fileName}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist'),
        vscode.Uri.joinPath(target, '..'),
      ],
    },
  )

  const renderHtml = async () =>
    composeToolHtml({
      webview: panel.webview,
      tool: TOOL,
      extensionUri: context.extensionUri,
    })

  panel.webview.html = await renderHtml()

  const bridge = createHostBridge(panel.webview)

  bridge.on('encode/ready', async () => {
    log(`encode/ready for ${fileName}`)
    bridge.emit('encode/init', { fileName, sourceBytes: Array.from(sourceBytes), targetDir: vscode.Uri.joinPath(target, '..').toString() })
    return { ok: true }
  })

  bridge.on<{ format: 'webp' | 'avif' | 'ktx2'; bytes: number[]; suggestedFilename: string }>(
    'encode/save',
    async ({ format, bytes, suggestedFilename }) => {
      const dest = vscode.Uri.joinPath(target, '..', suggestedFilename)
      const existing = await vscode.workspace.fs.stat(dest).catch(() => null)
      if (existing) {
        const choice = await vscode.window.showWarningMessage(
          `${suggestedFilename} already exists. Overwrite?`,
          { modal: true },
          'Overwrite',
        )
        if (choice !== 'Overwrite') return { ok: false, cancelled: true }
      }
      await vscode.workspace.fs.writeFile(dest, new Uint8Array(bytes))
      log(`encode/save wrote ${dest.fsPath} (${bytes.length} bytes, ${format})`)
      return { ok: true, savedUri: dest.toString() }
    },
  )

  bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
    log(`[webview:${level}]`, ...args)
    return { ok: true }
  })

  const disposeReload = setupDevReload(context.extensionUri, TOOL, () =>
    bridge.emit('dev/reload', { tool: TOOL }),
  )
  bridge.on('dev/reload-request', async () => {
    panel.webview.html = await renderHtml()
    return { ok: true }
  })

  panel.onDidDispose(() => {
    disposeReload.dispose()
    bridge.dispose()
  })
}
```

NOTE: `Array.from(sourceBytes)` is used because `Uint8Array` doesn't survive structured-clone over the bridge for older transport implementations. If the bridge supports `Uint8Array` directly, we can pass it as-is; the webview would do `new Uint8Array(payload.sourceBytes)` either way. Inspect `tools/bridge/src/` to confirm; if Uint8Array transports cleanly, drop the `Array.from` to save a copy.

- [ ] **Step 2: Build + smoke check**

```bash
cd /Users/tjw/.claude/worktrees/vscode-tools
pnpm --filter @three-flatland/vscode build 2>&1 | tail -5
```

Should be clean.

- [ ] **Step 3: Commit**

```bash
git add tools/vscode/extension/tools/encode/host.ts
git commit -m "feat(vscode): encode panel host — bridge, init, save"
```

---

### Task 3: Manual host smoke check

- [ ] **Step 1: F5 from VSCode**

Open `tools/vscode/` in VSCode → F5 → in the Extension Development Host, right-click any PNG → "Open Image Encoder". Expected: a panel opens; the title shows the filename; webview shows the placeholder Vite content (or the FOUC bg color) since `webview/encode/` doesn't exist yet.

If the panel doesn't open, inspect the `[FL]` log channel for errors. (`Output` → `FL` channel.)

- [ ] **Step 2: Document the manual smoke result**

No commit — just record in your task report whether the panel opens and any log output.

---

## Phase 2 — Webview shell + state

### Task 4: Webview boilerplate (index.html, main.tsx, empty App.tsx)

**Files:**
- Create: `tools/vscode/webview/encode/index.html`
- Create: `tools/vscode/webview/encode/main.tsx`
- Create: `tools/vscode/webview/encode/App.tsx`

- [ ] **Step 1: Copy merge's `index.html` and `main.tsx`**

```bash
cd /Users/tjw/.claude/worktrees/vscode-tools/tools/vscode/webview
cp merge/index.html encode/index.html
cp merge/main.tsx encode/main.tsx
```

- [ ] **Step 2: Edit `encode/index.html`**

Change `<title>` to `Encode`. Leave the FOUC `<style>` block verbatim — it's load-bearing.

- [ ] **Step 3: Edit `encode/main.tsx`**

Replace the import of `App` so it points at `./App`. The rest (codicon stylesheet tagging, error forwarding, dev-reload listener) stays the same. **Do not** add `void import('@three-flatland/preview/canvas')` — we don't use the canvas chunk. Add this prefetch instead, as our heavy chunk:

```ts
void import('@three-flatland/image')
```

- [ ] **Step 4: Stub `App.tsx`**

```tsx
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    background: vscode.bg,
    color: vscode.fg,
    padding: space.md,
  },
})

export function App(): JSX.Element {
  return <div {...stylex.props(styles.root)}>FL Image Encoder — initializing…</div>
}
```

- [ ] **Step 5: Build + verify the webview chunks**

```bash
cd /Users/tjw/.claude/worktrees/vscode-tools
pnpm --filter @three-flatland/vscode build 2>&1 | tail -20
```

Expected:
- `dist/webview/encode/index.html` exists
- `dist/webview/assets/encode-<hash>.js` < 30 KB (shell chunk; image package is lazy-loaded)
- No build errors

- [ ] **Step 6: Commit**

```bash
git add tools/vscode/webview/encode/index.html tools/vscode/webview/encode/main.tsx tools/vscode/webview/encode/App.tsx
git commit -m "feat(vscode): encode webview shell"
```

---

### Task 5: Encode store with zustand + zundo

**Files:**
- Create: `tools/vscode/webview/encode/encodeStore.ts`

- [ ] **Step 1: Read merge's `mergeStore.ts` first**

```bash
cat /Users/tjw/.claude/worktrees/vscode-tools/tools/vscode/webview/merge/mergeStore.ts | head -150
```

Mirror its middleware shape: `temporal(persist(persist((set) => …), { name: 'fl-encode-prefs', storage: localStorageStorage, partialize: prefsOnly }), { name: 'fl-encode-session', storage: webviewStorage, partialize: sessionOnly })`, with zundo's `partialize` covering only the document slice.

- [ ] **Step 2: Write `encodeStore.ts`**

Full file (~200 LOC):

```ts
import { create } from 'zustand'
import { temporal } from 'zundo'
import { createJSONStorage, persist } from 'zustand/middleware'
import { localStorageStorage } from '../state/localStorage'
import { webviewStorage } from '../state/webviewStorage'

export type Format = 'webp' | 'avif' | 'ktx2'

interface DocSlice {
  format: Format
  webp: { quality: number }
  avif: { quality: number }
  ktx2: { mode: 'etc1s' | 'uastc'; quality: number; mipmaps: boolean; uastcLevel: 0 | 1 | 2 | 3 | 4 }
}

interface SessionSlice {
  fileName: string
  sourceBytes: Uint8Array | null
  // sourceImage / encodedBytes / encodedImage are runtime caches and intentionally NOT persisted
}

interface PrefsSlice {
  splits: { encodedPanel: number }
}

interface RuntimeSlice {
  sourceImage: ImageData | null
  encodedBytes: Uint8Array | null
  encodedImage: ImageData | null
  encodedSize: number
  isEncoding: boolean
  encodeError: string | null
  // request id for race-safety
  encodeReqId: number
}

interface Actions {
  setFormat: (f: Format) => void
  setWebpQuality: (q: number) => void
  setAvifQuality: (q: number) => void
  setKtx2Mode: (m: 'etc1s' | 'uastc') => void
  setKtx2Quality: (q: number) => void
  setKtx2Mipmaps: (b: boolean) => void
  setKtx2UastcLevel: (l: 0 | 1 | 2 | 3 | 4) => void
  setSplits: (s: Partial<PrefsSlice['splits']>) => void
  loadInit: (p: { fileName: string; sourceBytes: Uint8Array; sourceImage: ImageData }) => void
  setRuntimeFields: (p: Partial<RuntimeSlice>) => void
  bumpEncodeReqId: () => number
}

type State = DocSlice & SessionSlice & PrefsSlice & RuntimeSlice & Actions

const DEFAULT_DOC: DocSlice = {
  format: 'webp',
  webp: { quality: 80 },
  avif: { quality: 50 },
  ktx2: { mode: 'etc1s', quality: 128, mipmaps: false, uastcLevel: 2 },
}

const DEFAULT_PREFS: PrefsSlice = { splits: { encodedPanel: 0 } } // 0 = 50/50 default

function docEqual(a: DocSlice, b: DocSlice): boolean {
  return (
    a.format === b.format &&
    a.webp.quality === b.webp.quality &&
    a.avif.quality === b.avif.quality &&
    a.ktx2.mode === b.ktx2.mode &&
    a.ktx2.quality === b.ktx2.quality &&
    a.ktx2.mipmaps === b.ktx2.mipmaps &&
    a.ktx2.uastcLevel === b.ktx2.uastcLevel
  )
}

function debounce<F extends (...args: never[]) => void>(fn: F, ms: number): F {
  let t: ReturnType<typeof setTimeout> | null = null
  return ((...args: never[]) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }) as F
}

export const useEncodeStore = create<State>()(
  temporal(
    persist(
      persist(
        (set, _get) => ({
          ...DEFAULT_DOC,
          ...DEFAULT_PREFS,
          fileName: '',
          sourceBytes: null,
          sourceImage: null,
          encodedBytes: null,
          encodedImage: null,
          encodedSize: 0,
          isEncoding: false,
          encodeError: null,
          encodeReqId: 0,
          setFormat: (format) => set({ format }),
          setWebpQuality: (q) => set((s) => ({ webp: { ...s.webp, quality: q } })),
          setAvifQuality: (q) => set((s) => ({ avif: { ...s.avif, quality: q } })),
          setKtx2Mode: (mode) => set((s) => ({ ktx2: { ...s.ktx2, mode } })),
          setKtx2Quality: (q) => set((s) => ({ ktx2: { ...s.ktx2, quality: q } })),
          setKtx2Mipmaps: (mipmaps) => set((s) => ({ ktx2: { ...s.ktx2, mipmaps } })),
          setKtx2UastcLevel: (uastcLevel) => set((s) => ({ ktx2: { ...s.ktx2, uastcLevel } })),
          setSplits: (s) => set((st) => ({ splits: { ...st.splits, ...s } })),
          loadInit: ({ fileName, sourceBytes, sourceImage }) => {
            set({
              fileName,
              sourceBytes,
              sourceImage,
              encodedBytes: null,
              encodedImage: null,
              encodedSize: 0,
              isEncoding: false,
              encodeError: null,
            })
            useEncodeStore.temporal.getState().clear()
          },
          setRuntimeFields: (p) => set(p as Partial<State>),
          bumpEncodeReqId: () => {
            const id = (useEncodeStore.getState().encodeReqId || 0) + 1
            set({ encodeReqId: id })
            return id
          },
        }),
        {
          name: 'fl-encode-prefs',
          storage: createJSONStorage(() => localStorageStorage),
          partialize: (s) => ({ splits: s.splits }),
        },
      ),
      {
        name: 'fl-encode-session',
        storage: createJSONStorage(() => webviewStorage),
        // Persist the format/knobs so reopening keeps your last choice. Don't
        // persist sourceBytes — host re-sends them via encode/init.
        partialize: (s) => ({
          format: s.format,
          webp: s.webp,
          avif: s.avif,
          ktx2: s.ktx2,
          fileName: s.fileName,
        }),
      },
    ),
    {
      partialize: (s): DocSlice => ({
        format: s.format,
        webp: s.webp,
        avif: s.avif,
        ktx2: s.ktx2,
      }),
      limit: 80,
      equality: (a, b) => docEqual(a, b),
      handleSet: (handleSet) => debounce(handleSet, 100),
    },
  ),
)
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/tjw/.claude/worktrees/vscode-tools
pnpm --filter @three-flatland/vscode typecheck 2>&1 | tail -3
```

Should be clean. If `localStorageStorage` / `webviewStorage` paths are wrong, adjust the import (look at how `mergeStore.ts` imports them).

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/webview/encode/encodeStore.ts
git commit -m "feat(vscode): encode store — zustand + zundo + persist"
```

---

## Phase 3 — Source decode + render

### Task 6: Bridge handshake → load source bytes → decode

**Files:**
- Modify: `tools/vscode/webview/encode/App.tsx`

- [ ] **Step 1: Wire bridge + decode in App**

```tsx
import { useEffect } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { decodeImage } from '@three-flatland/image'
import { createClientBridge } from '@three-flatland/bridge/client'
import { useEncodeStore } from './encodeStore'

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    background: vscode.bg,
    color: vscode.fg,
  },
})

export function App(): JSX.Element {
  const fileName = useEncodeStore((s) => s.fileName)
  const sourceImage = useEncodeStore((s) => s.sourceImage)
  const encodeError = useEncodeStore((s) => s.encodeError)
  const loadInit = useEncodeStore((s) => s.loadInit)
  const setRuntimeFields = useEncodeStore((s) => s.setRuntimeFields)

  useEffect(() => {
    const bridge = createClientBridge()
    bridge.on<{ fileName: string; sourceBytes: number[] | Uint8Array; targetDir: string }>(
      'encode/init',
      async ({ fileName: fn, sourceBytes }) => {
        try {
          const bytes = sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes)
          const ext = fn.split('.').pop()?.toLowerCase() ?? ''
          const fmt = ext === 'webp' ? 'webp' : ext === 'avif' ? 'avif' : 'png'
          const sourceImage = await decodeImage(bytes, fmt)
          loadInit({ fileName: fn, sourceBytes: bytes, sourceImage })
        } catch (err) {
          setRuntimeFields({ encodeError: `decode failed: ${err instanceof Error ? err.message : String(err)}` })
        }
      },
    )
    bridge.request('encode/ready').catch((e) => console.error('encode/ready failed', e))
    return () => bridge.dispose()
  }, [loadInit, setRuntimeFields])

  return (
    <div {...stylex.props(styles.root)}>
      <div style={{ padding: 12 }}>
        FL Image Encoder · {fileName || '(no file)'} · {sourceImage ? `${sourceImage.width}×${sourceImage.height}` : 'loading…'}
        {encodeError && <div style={{ color: 'red' }}>{encodeError}</div>}
      </div>
    </div>
  )
}
```

NOTE: `@three-flatland/image` exports `decodeImage(bytes, format)` per `packages/image/src/decode.ts`. If the signature differs (e.g., `decodeImage(bytes)` with auto-detection), adjust the call. Check the actual export in `packages/image/src/index.ts` and `decode.ts` before pasting.

- [ ] **Step 2: Build + manual smoke**

```bash
pnpm --filter @three-flatland/vscode build 2>&1 | tail -5
```

F5 → right-click a PNG → "Open Image Encoder". Expected: panel shows `FL Image Encoder · sample.png · 256×256` after a moment.

- [ ] **Step 3: Commit**

```bash
git add tools/vscode/webview/encode/App.tsx
git commit -m "feat(vscode): encode webview decodes source via @three-flatland/image"
```

---

### Task 7: Original viewer canvas

**Files:**
- Create: `tools/vscode/webview/encode/OriginalView.tsx`
- Modify: `tools/vscode/webview/encode/App.tsx` (mount it)

- [ ] **Step 1: Write `OriginalView.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Panel } from '@three-flatland/design-system'
import { useEncodeStore } from './encodeStore'

const styles = stylex.create({
  fill: { flex: 1, minWidth: 0, minHeight: 0 },
  canvas: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
})

export function OriginalView(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const sourceImage = useEncodeStore((s) => s.sourceImage)
  const sourceBytes = useEncodeStore((s) => s.sourceBytes)
  const fileName = useEncodeStore((s) => s.fileName)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !sourceImage) return
    canvas.width = sourceImage.width
    canvas.height = sourceImage.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(sourceImage, 0, 0)
  }, [sourceImage])

  const sizeKB = sourceBytes ? `${(sourceBytes.length / 1024).toFixed(0)} KB` : '—'
  const dims = sourceImage ? `${sourceImage.width}×${sourceImage.height}` : ''
  const ext = fileName.split('.').pop()?.toUpperCase() ?? ''

  return (
    <Panel
      title={`Original · ${dims} · ${sizeKB} ${ext}`}
      bodyPadding="none"
      style={{ flex: 1, minWidth: 0, minHeight: 0 }}
    >
      {sourceImage ? <canvas ref={ref} {...stylex.props(styles.canvas)} /> : <div>loading…</div>}
    </Panel>
  )
}
```

- [ ] **Step 2: Mount in `App.tsx`**

Replace the placeholder body of App with:

```tsx
import { OriginalView } from './OriginalView'
// ...
return (
  <div {...stylex.props(styles.root)}>
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <OriginalView />
    </div>
    {encodeError && <div style={{ color: 'red', padding: 8 }}>{encodeError}</div>}
  </div>
)
```

- [ ] **Step 3: Build + manual smoke**

The original image should now render in the panel.

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/webview/encode/OriginalView.tsx tools/vscode/webview/encode/App.tsx
git commit -m "feat(vscode): encode original-view canvas"
```

---

## Phase 4 — Encode + render

### Task 8: Encode pipeline (debounced, race-safe)

**Files:**
- Create: `tools/vscode/webview/encode/encodePipeline.ts`

- [ ] **Step 1: Write the pipeline**

```ts
import { encodeImage, decodeImage, type EncodeFormat, type ImageEncodeOptions } from '@three-flatland/image'
import { useEncodeStore } from './encodeStore'

let timer: ReturnType<typeof setTimeout> | null = null

function buildOpts(state: ReturnType<typeof useEncodeStore.getState>): ImageEncodeOptions {
  switch (state.format) {
    case 'webp':
      return { format: 'webp', quality: state.webp.quality }
    case 'avif':
      return { format: 'avif', quality: state.avif.quality }
    case 'ktx2':
      return {
        format: 'ktx2',
        basis: {
          mode: state.ktx2.mode,
          mipmaps: state.ktx2.mipmaps,
          uastcLevel: state.ktx2.uastcLevel,
        },
      }
  }
}

async function runEncode(): Promise<void> {
  const state = useEncodeStore.getState()
  if (!state.sourceImage) return
  const reqId = state.bumpEncodeReqId()
  state.setRuntimeFields({ isEncoding: true, encodeError: null })

  try {
    const opts = buildOpts(state)
    const encoded = await encodeImage(state.sourceImage, opts)
    // race guard: if a newer request started, drop this result.
    if (useEncodeStore.getState().encodeReqId !== reqId) return
    // KTX2 decode is NOT supported by @three-flatland/image (use three.js
    // KTX2Loader at runtime). For visual preview we can only decode WebP/AVIF.
    // For KTX2, we skip the decode and the EncodedView shows a placeholder.
    let decoded: ImageData | null = null
    if (opts.format !== 'ktx2') {
      decoded = await decodeImage(encoded, opts.format)
      if (useEncodeStore.getState().encodeReqId !== reqId) return
    }
    state.setRuntimeFields({
      encodedBytes: encoded,
      encodedImage: decoded,
      encodedSize: encoded.length,
      isEncoding: false,
    })
  } catch (err) {
    if (useEncodeStore.getState().encodeReqId !== reqId) return
    state.setRuntimeFields({
      isEncoding: false,
      encodeError: err instanceof Error ? err.message : String(err),
    })
  }
}

export function scheduleEncode(delayMs: number = 250): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    void runEncode()
  }, delayMs)
}
```

NOTE: `@three-flatland/image`'s public API is `encodeImage(image, format, opts)` and `decodeImage(bytes, format)` per `packages/image/src/encode.ts` and `decode.ts`. If signatures or the `EncodeFormat` / `ImageEncodeOptions` type names differ, look them up in `packages/image/src/types.ts` and adjust.

- [ ] **Step 2: Wire it from App**

In `App.tsx`, subscribe to the doc slice + sourceImage and call `scheduleEncode()` on changes:

```tsx
import { scheduleEncode } from './encodePipeline'
// inside App, after existing useEffects:
useEffect(() => {
  const unsub = useEncodeStore.subscribe(
    (s) => ({
      hasImage: s.sourceImage !== null,
      format: s.format,
      webp: s.webp,
      avif: s.avif,
      ktx2: s.ktx2,
    }),
    ({ hasImage }) => {
      if (hasImage) scheduleEncode(250)
    },
    { equalityFn: (a, b) => a.hasImage === b.hasImage && a.format === b.format && JSON.stringify({ w: a.webp, a: a.avif, k: a.ktx2 }) === JSON.stringify({ w: b.webp, a: b.avif, k: b.ktx2 }) },
  )
  return () => unsub()
}, [])
```

NOTE: zustand v4's `subscribe` with selector + equalityFn signature varies; verify against `mergeStore` consumers. If the API differs, switch to subscribing to the whole state and comparing manually.

- [ ] **Step 3: Build, F5, smoke**

Open a PNG. The encode should fire ~250ms after init. No UI yet for the result; verify via console (`encodedSize` should log via the debug toast or via store inspection). Add a temporary `console.log('encoded:', useEncodeStore.getState().encodedSize)` if needed.

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/webview/encode/encodePipeline.ts tools/vscode/webview/encode/App.tsx
git commit -m "feat(vscode): debounced race-safe encode pipeline"
```

---

### Task 9: Wire vendor wasms into webview build

The webview imports `@three-flatland/image`. That package's KTX2 codec dynamically loads `vendor/basis/basis_encoder.wasm` from disk (Node) or via fetch (browser). In the VSCode webview the wasm needs to be reachable via a webview URL.

**Files:**
- Modify: `tools/vscode/build.ts` or `tools/vscode/vite.config.ts` (whichever handles asset copying) — add a step copying `packages/image/vendor/basis/basis_encoder.wasm` (and any @jsquash wasms) into `dist/` so they're under `localResourceRoots`.

- [ ] **Step 1: Read the existing build**

```bash
cat /Users/tjw/.claude/worktrees/vscode-tools/tools/vscode/vite.config.ts 2>/dev/null
cat /Users/tjw/.claude/worktrees/vscode-tools/tools/vscode/build.ts 2>/dev/null
```

Identify how vendored assets are currently shipped to the dist tree.

- [ ] **Step 2: Add a copy step**

Likely a `vite-plugin-static-copy` or equivalent. Add:

```ts
{
  src: 'node_modules/@three-flatland/image/vendor/basis/*',
  dest: 'webview/vendor/basis',
}
```

Plus the @jsquash wasms:

```ts
{ src: 'node_modules/@jsquash/png/codec/pkg/*.wasm', dest: 'webview/vendor/jsquash/png' },
{ src: 'node_modules/@jsquash/webp/codec/{enc,dec}/*.wasm', dest: 'webview/vendor/jsquash/webp' },
{ src: 'node_modules/@jsquash/avif/codec/{enc,dec}/*.wasm', dest: 'webview/vendor/jsquash/avif' },
```

The exact paths depend on jsquash's package layout — inspect `node_modules/@jsquash/*/codec/` and pick the wasm files actually loaded at runtime.

- [ ] **Step 3: Verify in `host.ts`**

`localResourceRoots` already includes `dist/`, so wasms under `dist/webview/vendor/` are accessible.

- [ ] **Step 4: Confirm @three-flatland/image's loader resolves under the webview URL scheme**

This is the tricky bit. The codecs use `import.meta.url` to derive the wasm path. In a webview, `import.meta.url` resolves to a `vscode-webview://…/dist/webview/assets/encode-<hash>.js`-style URL. The `new URL('../../vendor/basis/basis_encoder.wasm', import.meta.url)` math should land at `vscode-webview://…/dist/webview/vendor/basis/basis_encoder.wasm` — only if our copy step puts it there.

If the path math is wrong, two fixes:
1. Rewrite the copy destination to match what `import.meta.url` resolves to.
2. Override the loader: extend `@three-flatland/image` with a `setBasisWasmUrl()` API and call it at App init with `new URL('vendor/basis/basis_encoder.wasm', document.baseURI).toString()`.

Option 2 is more robust. If we go with it, expose a small helper from `@three-flatland/image/runtime` to override the wasm URL.

- [ ] **Step 5: Build + smoke**

After build, F5 and watch for any wasm-load errors in the FL log channel. The first encode should succeed without `404` or `cannot find wasm`.

- [ ] **Step 6: Commit**

```bash
git add tools/vscode/vite.config.ts # or whatever was edited
# possibly also a small change in packages/image/ if option 2 was chosen
git commit -m "build(vscode): ship vendored wasms to encode webview"
```

---

### Task 10: Encoded viewer canvas

**Files:**
- Create: `tools/vscode/webview/encode/EncodedView.tsx`
- Modify: `tools/vscode/webview/encode/App.tsx` (add it next to OriginalView)

- [ ] **Step 1: Write `EncodedView.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Panel } from '@three-flatland/design-system'
import { useEncodeStore } from './encodeStore'

const styles = stylex.create({
  canvas: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  overlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(0,0,0,0.5)',
    color: 'white',
    padding: '4px 8px',
    fontSize: 11,
  },
})

export function EncodedView(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const encodedImage = useEncodeStore((s) => s.encodedImage)
  const encodedSize = useEncodeStore((s) => s.encodedSize)
  const sourceBytes = useEncodeStore((s) => s.sourceBytes)
  const isEncoding = useEncodeStore((s) => s.isEncoding)
  const format = useEncodeStore((s) => s.format)
  const encodeError = useEncodeStore((s) => s.encodeError)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !encodedImage) return
    canvas.width = encodedImage.width
    canvas.height = encodedImage.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(encodedImage, 0, 0)
  }, [encodedImage])

  const ratio = encodedSize > 0 && sourceBytes ? `${(sourceBytes.length / encodedSize).toFixed(1)}×` : ''
  const sizeKB = encodedSize > 0 ? `${(encodedSize / 1024).toFixed(0)} KB` : '—'

  return (
    <Panel
      title={`Encoded · ${format} · ${sizeKB} ${ratio}`}
      bodyPadding="none"
      style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}
    >
      {encodedImage ? (
        <canvas ref={ref} {...stylex.props(styles.canvas)} />
      ) : encodedSize > 0 && format === 'ktx2' ? (
        <div style={{ padding: 24, fontSize: 13, opacity: 0.7 }}>
          KTX2 preview unavailable — decode is provided by three.js KTX2Loader at runtime.
          The encoded file is ready to save.
        </div>
      ) : (
        <div style={{ padding: 24 }}>(encode pending)</div>
      )}
      {isEncoding && <div {...stylex.props(styles.overlay)}>encoding…</div>}
      {encodeError && <div {...stylex.props(styles.overlay)} style={{ color: '#f88' }}>{encodeError}</div>}
    </Panel>
  )
}
```

- [ ] **Step 2: Mount alongside OriginalView with a Splitter**

In `App.tsx`:

```tsx
import { Splitter } from '@three-flatland/design-system'
import { EncodedView } from './EncodedView'
// ...
const splits = useEncodeStore((s) => s.splits)
const setSplits = useEncodeStore((s) => s.setSplits)
return (
  <div {...stylex.props(styles.root)}>
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}><OriginalView /></div>
      <Splitter axis="horizontal" onDrag={(px) => setSplits({ encodedPanel: px })} />
      <div style={{ width: splits.encodedPanel || '50%', minWidth: 0, display: 'flex' }}><EncodedView /></div>
    </div>
    {encodeError && <div style={{ color: 'red', padding: 8 }}>{encodeError}</div>}
  </div>
)
```

(Splitter axis name and `onDrag` signature: verify against the design-system source. Atlas/merge reference for the canonical idiom.)

- [ ] **Step 3: Build + manual smoke**

Both panels visible side-by-side; encoded canvas updates as the encode pipeline runs.

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/webview/encode/EncodedView.tsx tools/vscode/webview/encode/App.tsx
git commit -m "feat(vscode): encode encoded-view canvas + splitter"
```

---

## Phase 5 — Knobs + save

### Task 11: Knobs UI (format-specific)

**Files:**
- Create: `tools/vscode/webview/encode/Knobs.tsx`
- Modify: `tools/vscode/webview/encode/EncodedView.tsx` (mount Knobs in the panel footer or below the canvas)

- [ ] **Step 1: Write `Knobs.tsx`**

```tsx
import { CompactSelect, Option, NumberField, Checkbox } from '@three-flatland/design-system'
import { useEncodeStore, type Format } from './encodeStore'

export function Knobs(): JSX.Element {
  const format = useEncodeStore((s) => s.format)
  const webp = useEncodeStore((s) => s.webp)
  const avif = useEncodeStore((s) => s.avif)
  const ktx2 = useEncodeStore((s) => s.ktx2)
  const setFormat = useEncodeStore((s) => s.setFormat)
  const setWebpQuality = useEncodeStore((s) => s.setWebpQuality)
  const setAvifQuality = useEncodeStore((s) => s.setAvifQuality)
  const setKtx2Mode = useEncodeStore((s) => s.setKtx2Mode)
  const setKtx2Quality = useEncodeStore((s) => s.setKtx2Quality)
  const setKtx2Mipmaps = useEncodeStore((s) => s.setKtx2Mipmaps)
  const setKtx2UastcLevel = useEncodeStore((s) => s.setKtx2UastcLevel)

  return (
    <div style={{ display: 'flex', gap: 12, padding: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <label>Format</label>
      <CompactSelect value={format} onChange={(v) => setFormat(v as Format)}>
        <Option value="webp">WebP</Option>
        <Option value="avif">AVIF</Option>
        <Option value="ktx2">KTX2</Option>
      </CompactSelect>

      {format === 'webp' && (
        <>
          <label>Quality</label>
          <NumberField value={webp.quality} min={0} max={100} step={1} onChange={setWebpQuality} />
        </>
      )}

      {format === 'avif' && (
        <>
          <label>Quality</label>
          <NumberField value={avif.quality} min={0} max={100} step={1} onChange={setAvifQuality} />
        </>
      )}

      {format === 'ktx2' && (
        <>
          <label>Mode</label>
          <CompactSelect value={ktx2.mode} onChange={(v) => setKtx2Mode(v as 'etc1s' | 'uastc')}>
            <Option value="etc1s">ETC1S</Option>
            <Option value="uastc">UASTC</Option>
          </CompactSelect>
          {ktx2.mode === 'uastc' && (
            <>
              <label>Level</label>
              <NumberField value={ktx2.uastcLevel} min={0} max={4} step={1} onChange={(v) => setKtx2UastcLevel(v as 0 | 1 | 2 | 3 | 4)} />
            </>
          )}
          <Checkbox checked={ktx2.mipmaps} onChange={setKtx2Mipmaps}>Mipmaps</Checkbox>
          {/* ETC1S quality is currently fixed at 128 in @three-flatland/image; if the
              package later exposes opts.basis.quality, surface a NumberField here. */}
        </>
      )}
    </div>
  )
}
```

(Verify the design-system primitive prop names. Reference `tools/vscode/webview/merge/Toolbar.tsx` for `CompactSelect` / `Option` / `NumberField` usage idioms in this codebase.)

- [ ] **Step 2: Mount Knobs**

In `App.tsx`, drop the Knobs row above the splitter section:

```tsx
import { Knobs } from './Knobs'
// ...
<Knobs />
<div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
  ...
</div>
```

- [ ] **Step 3: Build + manual smoke**

Change format / quality — encoded canvas should update after the 250ms debounce.

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/webview/encode/Knobs.tsx tools/vscode/webview/encode/App.tsx
git commit -m "feat(vscode): encode knobs UI (format + quality)"
```

---

### Task 12: Save flow

**Files:**
- Create: `tools/vscode/webview/encode/Toolbar.tsx`
- Modify: `tools/vscode/webview/encode/App.tsx` (mount Toolbar)

- [ ] **Step 1: Write Toolbar**

```tsx
import { Toolbar as DSToolbar, ToolbarButton, Icon } from '@three-flatland/design-system'
import { useStore } from 'zustand'
import { createClientBridge } from '@three-flatland/bridge/client'
import { useEncodeStore } from './encodeStore'

export function Toolbar(): JSX.Element {
  const encodedBytes = useEncodeStore((s) => s.encodedBytes)
  const fileName = useEncodeStore((s) => s.fileName)
  const format = useEncodeStore((s) => s.format)

  const past = useStore(useEncodeStore.temporal, (s) => s.pastStates.length)
  const future = useStore(useEncodeStore.temporal, (s) => s.futureStates.length)

  const undo = () => useEncodeStore.temporal.getState().undo()
  const redo = () => useEncodeStore.temporal.getState().redo()

  const onSave = async () => {
    if (!encodedBytes) return
    const base = fileName.replace(/\.[^.]+$/, '')
    const ext = format
    const suggestedFilename = `${base}.${ext}`
    const bridge = createClientBridge()
    try {
      await bridge.request('encode/save', { format, bytes: Array.from(encodedBytes), suggestedFilename })
    } finally {
      bridge.dispose()
    }
  }

  return (
    <DSToolbar>
      <ToolbarButton title="Undo" onClick={undo} disabled={past === 0}><Icon name="discard" /></ToolbarButton>
      <ToolbarButton title="Redo" onClick={redo} disabled={future === 0}><Icon name="redo" /></ToolbarButton>
      <ToolbarButton title="Save" onClick={onSave} disabled={!encodedBytes}><Icon name="save" /></ToolbarButton>
    </DSToolbar>
  )
}
```

(Check the actual `Toolbar` / `ToolbarButton` API in the design-system. Atlas's `App.tsx` is a good reference.)

- [ ] **Step 2: Mount in App**

```tsx
<Toolbar />
<Knobs />
<div style={{ display: 'flex', flex: 1, minHeight: 0 }}>...</div>
```

- [ ] **Step 3: Build + manual smoke**

Click Save. The host should write `<base>.webp` (or .avif/.ktx2) next to the source. If overwriting, VSCode prompts.

- [ ] **Step 4: Commit**

```bash
git add tools/vscode/webview/encode/Toolbar.tsx tools/vscode/webview/encode/App.tsx
git commit -m "feat(vscode): encode toolbar + save flow"
```

---

## Phase 6 — Polish + verify

### Task 13: Cmd/Ctrl+Z hotkeys

**Files:**
- Modify: `tools/vscode/webview/encode/App.tsx`

- [ ] **Step 1: Add a useEffect that listens for keydown**

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as HTMLElement).isContentEditable)) return
    const cmdOrCtrl = e.metaKey || e.ctrlKey
    if (!cmdOrCtrl) return
    if (e.key === 'z' && !e.shiftKey) { useEncodeStore.temporal.getState().undo(); e.preventDefault() }
    else if (e.key === 'z' && e.shiftKey) { useEncodeStore.temporal.getState().redo(); e.preventDefault() }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [])
```

- [ ] **Step 2: Build + smoke + commit**

```bash
git add tools/vscode/webview/encode/App.tsx
git commit -m "feat(vscode): undo/redo hotkeys for encode tool"
```

---

### Task 14: Whole-repo gate

- [ ] **Step 1: Build, typecheck, test**

```bash
cd /Users/tjw/.claude/worktrees/vscode-tools
pnpm build 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -3
pnpm test 2>&1 | tail -6
```

All green. Test count should match the prior baseline (we added no new tests in this plan; manual smoke is the verification).

- [ ] **Step 2: Inspect bundle sizes**

```bash
ls -la tools/vscode/dist/webview/encode/
ls -la tools/vscode/dist/webview/assets/encode-*.js
```

The `encode-<hash>.js` shell chunk should be < 30 KB; `@three-flatland/image` should be its own chunk (lazy-loaded via the prefetch in main.tsx).

- [ ] **Step 3: Commit (empty checkpoint with measurements)**

```bash
git commit --allow-empty -m "checkpoint(vscode): encode tool ships — shell=<N>KB, image-chunk=<M>KB"
```

---

### Task 15: Test gate report

**Files:**
- Create: `planning/superpowers/specs/2026-05-02-image-encoder-tool-gate-report.md`

- [ ] **Step 1: Write report**

Mirror the structure of the predecessor reports. Cover:

- Each spec success criterion 1–9 with PASS/MEASURED/etc.
- Bundle sizes (shell chunk, image chunk, dist tree)
- Whole-repo state (test/build/typecheck counts, last commits)
- Manual verification notes (what was clicked / what happened)
- "What's next" — Phase 2.2 features filed for future

- [ ] **Step 2: Commit**

```bash
git add planning/superpowers/specs/2026-05-02-image-encoder-tool-gate-report.md
git commit -m "docs(vscode): encode tool test gate report"
```

---

## End-of-plan checklist

- [ ] Right-click PNG → "Open Image Encoder" → panel opens
- [ ] WebP/AVIF/KTX2 all encode and render
- [ ] Save writes the file with overwrite confirmation
- [ ] Cmd/Ctrl+Z undoes knob changes
- [ ] Splitter width persists across reopen
- [ ] Bundle shell < 30 KB
- [ ] Whole-repo green
- [ ] Gate report committed

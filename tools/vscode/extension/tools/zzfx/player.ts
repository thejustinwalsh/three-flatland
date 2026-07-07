// Singleton "quick preview" panel for `▶ Play` / playAtCursor — deliberately
// separate from the full editor panel (host.ts) rather than reusing it:
// opening the full sliders-and-panels editor just to hear one sound would
// defeat the point of an instant CodeLens preview, and the play path
// shouldn't force-load the heavier editor bundle. `webview/zzfxPlayer/` is
// a ~3-file minimal webview that reuses webview/zzfx/audio.ts + params.ts
// directly (same Vite root, ordinary sibling import).
//
// Autoplay-policy note: the first Play in a session may not produce sound
// if the browser blocks AudioContext.resume() without a real user gesture
// INSIDE this webview's own document (VS Code opening the panel from a
// command does not count — the click happened in a different browsing
// context entirely). The webview always shows a manual "▶ Play again"
// button as a fallback for that case; every play after the context is
// unlocked (by either path) works silently. See webview/zzfxPlayer/App.tsx.
import * as vscode from 'vscode'
import { createHostBridge, type HostBridge } from '@three-flatland/bridge/host'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'

const TOOL = 'zzfxPlayer'

let panel: vscode.WebviewPanel | undefined
let bridge: HostBridge | undefined
let readyPromise: Promise<void> | undefined

function createPanel(context: vscode.ExtensionContext): void {
  panel = vscode.window.createWebviewPanel(
    'threeFlatland.zzfxPlayer',
    'FL ZzFX Player',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    }
  )

  const renderHtml = async () =>
    composeToolHtml({ webview: panel!.webview, tool: TOOL, extensionUri: context.extensionUri })

  let resolveReady!: () => void
  readyPromise = new Promise((resolve) => {
    resolveReady = resolve
  })

  void renderHtml().then((html) => {
    panel!.webview.html = html
  })

  bridge = createHostBridge(panel.webview)
  bridge.on('zzfxPlayer/ready', async () => {
    resolveReady()
    return { ok: true }
  })
  bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
    log(`[webview:${level}]`, ...args)
    return { ok: true }
  })
  const disposeReload = setupDevReload(context.extensionUri, TOOL, () =>
    bridge!.emit('dev/reload', { tool: TOOL })
  )
  bridge.on('dev/reload-request', async () => {
    panel!.webview.html = await renderHtml()
    return { ok: true }
  })

  panel.onDidDispose(() => {
    disposeReload.dispose()
    bridge?.dispose()
    panel = undefined
    bridge = undefined
    readyPromise = undefined
  })
}

/** Plays `params` in the shared player panel — creates it on first call,
 * reveals (without stealing focus) and reuses it thereafter. */
export async function openZzfxPlayerPanel(
  context: vscode.ExtensionContext,
  params: number[]
): Promise<void> {
  if (!panel) {
    createPanel(context)
  } else {
    panel.reveal(vscode.ViewColumn.Beside, true)
  }
  await readyPromise
  bridge!.emit('zzfxPlayer/play', { params })
}

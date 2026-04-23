import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import { composeAtlasHtml } from './html.js'
import { log } from '../../log.js'

type AtlasDocument = vscode.CustomDocument

export class AtlasCustomEditorProvider implements vscode.CustomReadonlyEditorProvider<AtlasDocument> {
  static readonly viewType = 'threeFlatland.atlas'

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): AtlasDocument {
    log(`openCustomDocument: ${uri.fsPath}`)
    return { uri, dispose: () => void 0 }
  }

  async resolveCustomEditor(document: AtlasDocument, panel: vscode.WebviewPanel): Promise<void> {
    log(`resolveCustomEditor: ${document.uri.fsPath}`)
    const extUri = this.context.extensionUri
    const webview = panel.webview

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extUri, 'dist'),
        vscode.Uri.joinPath(document.uri, '..'),
      ],
    }

    const webviewDir = vscode.Uri.joinPath(extUri, 'dist', 'webview', 'atlas')
    const imageUri = webview.asWebviewUri(document.uri).toString()
    const fileName = document.uri.path.split('/').pop() ?? 'image.png'

    log(`webviewDir = ${webviewDir.fsPath}`)
    log(`imageUri   = ${imageUri}`)

    webview.html = await composeAtlasHtml({
      webview,
      webviewDir,
      cspSource: webview.cspSource,
      initialPayload: { imageUri, fileName },
      log: (msg) => log(`[html] ${msg}`),
    })

    log(`webview.html length = ${webview.html.length}`)

    const bridge = createHostBridge(webview)
    bridge.on('atlas/ready', async () => {
      log('webview sent atlas/ready')
      bridge.emit('atlas/init', { imageUri, fileName })
      return { ok: true }
    })

    // Forward any client-side console.error the webview ships (via our
    // `client/log` event — wired in the webview's App.tsx) into the
    // extension's output channel so the user can see them without
    // opening Webview DevTools.
    bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
      log(`[webview:${level}]`, ...args)
      return { ok: true }
    })

    panel.onDidDispose(() => {
      log(`panel disposed: ${document.uri.fsPath}`)
      bridge.dispose()
    })
  }
}

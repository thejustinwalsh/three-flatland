import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import { getWebviewHtml } from 'virtual:vscode'
import { log } from '../../log'

type AtlasDocument = vscode.CustomDocument

export class AtlasCustomEditorProvider implements vscode.CustomReadonlyEditorProvider<AtlasDocument> {
  static readonly viewType = 'threeFlatland.atlas'

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): AtlasDocument {
    log(`openCustomDocument: ${uri.fsPath}`)
    return { uri, dispose: () => void 0 }
  }

  resolveCustomEditor(document: AtlasDocument, panel: vscode.WebviewPanel): void {
    log(`resolveCustomEditor: ${document.uri.fsPath}`)
    const webview = panel.webview

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(document.uri, '..'),
      ],
    }

    const imageUri = webview.asWebviewUri(document.uri).toString()
    const fileName = document.uri.path.split('/').pop() ?? 'image.png'

    log(`imageUri = ${imageUri}`)

    // getWebviewHtml resolves asset URIs via asWebviewUri(), injects a
    // CSP meta + nonce, and in dev mode points at the Vite dev server for
    // HMR. One call replaces the entire composeAtlasHtml / tokenize-and-
    // rewrite dance.
    panel.webview.html = getWebviewHtml({
      serverUrl: process.env.VITE_DEV_SERVER_URL,
      webview,
      context: this.context,
      injectCode: `<script>window.__FL_ATLAS__ = ${JSON.stringify({
        imageUri,
        fileName,
      })};</script>`,
    })

    const bridge = createHostBridge(webview)

    bridge.on('atlas/ready', async () => {
      log('webview sent atlas/ready')
      bridge.emit('atlas/init', { imageUri, fileName })
      return { ok: true }
    })

    // Forward webview console.error/warn/etc. into the output channel.
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

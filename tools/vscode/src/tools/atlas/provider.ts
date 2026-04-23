import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import { composeAtlasHtml } from './html.js'

type AtlasDocument = vscode.CustomDocument

export class AtlasCustomEditorProvider implements vscode.CustomReadonlyEditorProvider<AtlasDocument> {
  static readonly viewType = 'threeFlatland.atlas'

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): AtlasDocument {
    return { uri, dispose: () => void 0 }
  }

  async resolveCustomEditor(
    document: AtlasDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
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

    webview.html = await composeAtlasHtml({
      webview,
      webviewDir,
      cspSource: webview.cspSource,
      initialPayload: {
        imageUri,
        fileName: document.uri.path.split('/').pop() ?? 'image.png',
      },
    })

    const bridge = createHostBridge(webview)
    bridge.on('atlas/ready', async () => {
      // Webview finished boot — push the initial payload again in case it
      // missed the inline bootstrap (reload after HMR, retainContextWhenHidden
      // edges, etc.).
      bridge.emit('atlas/init', {
        imageUri,
        fileName: document.uri.path.split('/').pop() ?? 'image.png',
      })
      return { ok: true }
    })

    panel.onDidDispose(() => bridge.dispose())
  }
}

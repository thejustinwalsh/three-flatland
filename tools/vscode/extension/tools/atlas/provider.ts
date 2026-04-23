import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'

const TOOL = 'atlas'

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
    const webview = panel.webview

    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(document.uri, '..'),
      ],
    }

    const fileName = document.uri.path.split('/').pop() ?? 'image.png'
    const imageUri = webview.asWebviewUri(document.uri).toString()

    log(`imageUri = ${imageUri}`)

    panel.webview.html = await composeToolHtml({
      webview,
      tool: TOOL,
      extensionUri: this.context.extensionUri,
      injectCode: `<script>window.__FL_ATLAS__ = ${JSON.stringify({ imageUri, fileName })};</script>`,
    })

    const bridge = createHostBridge(webview)

    bridge.on('atlas/ready', async () => {
      log('webview sent atlas/ready')
      bridge.emit('atlas/init', { imageUri, fileName })
      return { ok: true }
    })

    bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
      log(`[webview:${level}]`, ...args)
      return { ok: true }
    })

    // PWA-style live reload. See extension/webview-host.ts.
    const disposeReload = setupDevReload(this.context.extensionUri, TOOL, () => {
      log('dev/reload → nudging webview')
      bridge.emit('dev/reload', { tool: TOOL })
    })

    panel.onDidDispose(() => {
      log(`panel disposed: ${document.uri.fsPath}`)
      disposeReload.dispose()
      bridge.dispose()
    })
  }
}

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

    const renderHtml = async () =>
      composeToolHtml({
        webview,
        tool: TOOL,
        extensionUri: this.context.extensionUri,
        injectCode: `<script>window.__FL_ATLAS__ = ${JSON.stringify({ imageUri, fileName })};</script>`,
      })

    panel.webview.html = await renderHtml()

    // One bridge lives across re-renders. Setting panel.webview.html below
    // replaces the webview document (and its client bridge instance), but
    // our host-side listeners stay subscribed via panel.webview's
    // onDidReceiveMessage which persists across html reassignments.
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

    // Toast "Reload" click → re-render the HTML from disk. VSCode webviews
    // can't location.reload() their inline HTML (ENOENT on the non-existent
    // origin file); reassigning webview.html is the supported re-render
    // path and it picks up the freshly-built bundle transparently.
    bridge.on('dev/reload-request', async () => {
      log('dev/reload-request → re-rendering webview.html')
      panel.webview.html = await renderHtml()
      return { ok: true }
    })

    // fs-watch dist/webview/<tool> for rebuilds. Emits 'dev/reload' as a
    // notification (not a reload); the webview's toast then waits for the
    // user to click Reload (which round-trips back as dev/reload-request).
    const disposeReload = setupDevReload(this.context.extensionUri, TOOL, () => {
      log('dev/reload → notifying webview (opt-in reload)')
      bridge.emit('dev/reload', { tool: TOOL })
    })

    panel.onDidDispose(() => {
      log(`panel disposed: ${document.uri.fsPath}`)
      disposeReload.dispose()
      bridge.dispose()
    })
  }
}

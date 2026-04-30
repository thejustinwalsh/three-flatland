import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'

const TOOL = 'merge'

export async function openMergePanel(
  context: vscode.ExtensionContext,
  sidecarUris: vscode.Uri[]
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'threeFlatland.merge',
    `Merge: ${sidecarUris.map((u) => labelFor(u)).join(', ')}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ...sidecarUris.map((u) => vscode.Uri.joinPath(u, '..')),
      ],
    }
  )

  const renderHtml = async () =>
    composeToolHtml({
      webview: panel.webview,
      tool: TOOL,
      extensionUri: context.extensionUri,
      injectCode: '',
    })
  panel.webview.html = await renderHtml()

  const bridge = createHostBridge(panel.webview)

  bridge.on('merge/ready', async () => {
    log(`merge/ready (sources=${sidecarUris.length})`)
    bridge.emit('merge/init', {
      sources: sidecarUris.map((u) => ({ uri: u.toString() })),
    })
    return { ok: true }
  })

  bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
    log(`[webview:${level}]`, ...args)
    return { ok: true }
  })

  bridge.on('dev/reload-request', async () => {
    panel.webview.html = await renderHtml()
    return { ok: true }
  })
  const disposeReload = setupDevReload(context.extensionUri, TOOL, () => {
    bridge.emit('dev/reload', { tool: TOOL })
  })

  panel.onDidDispose(() => {
    disposeReload.dispose()
    bridge.dispose()
  })
}

function labelFor(uri: vscode.Uri): string {
  const name = uri.path.split('/').pop() ?? uri.fsPath
  return name.replace(/\.atlas\.json$/, '')
}

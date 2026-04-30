import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'
import { assertValidAtlas } from '../atlas/validateAtlas'

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
    const sources: Array<{
      uri: string
      imageUri: string
      alias: string
      json: unknown
    }> = []
    const errors: Array<{ uri: string; message: string }> = []
    for (const sidecar of sidecarUris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(sidecar)
        const text = new TextDecoder('utf-8').decode(bytes)
        const json = JSON.parse(text) as { meta?: { image?: string } }
        assertValidAtlas(json)
        const metaImage = json?.meta?.image
        if (typeof metaImage !== 'string' || metaImage.length === 0) {
          throw new Error('meta.image missing')
        }
        const imageUri = vscode.Uri.joinPath(sidecar, '..', metaImage)
        sources.push({
          uri: sidecar.toString(),
          imageUri: panel.webview.asWebviewUri(imageUri).toString(),
          alias: labelFor(sidecar),
          json,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ uri: sidecar.toString(), message })
      }
    }
    bridge.emit('merge/init', { sources, errors })
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

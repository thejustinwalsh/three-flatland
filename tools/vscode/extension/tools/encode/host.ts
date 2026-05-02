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
    bridge.emit('encode/init', {
      fileName,
      sourceBytes: Array.from(sourceBytes),
    })
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
        if (choice !== 'Overwrite') {
          log(`encode/save cancelled for ${suggestedFilename}`)
          return { ok: false, cancelled: true }
        }
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

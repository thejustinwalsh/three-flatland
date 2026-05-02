import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'

const TOOL = 'encode'
const MAX_BYTES = 16 * 1024 * 1024

type EncodeDocument = vscode.CustomDocument

export class EncodeCustomEditorProvider
  implements vscode.CustomReadonlyEditorProvider<EncodeDocument>
{
  static readonly viewType = 'threeFlatland.encode'

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): EncodeDocument {
    log(`encode openCustomDocument: ${uri.fsPath}`)
    return { uri, dispose: () => void 0 }
  }

  async resolveCustomEditor(
    document: EncodeDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const target = document.uri
    const fileName = target.path.split('/').pop() ?? 'image'
    const fileExt = fileName.split('.').pop()?.toLowerCase() ?? ''

    if (!['png', 'webp', 'avif', 'ktx2'].includes(fileExt)) {
      void vscode.window.showErrorMessage(
        `FL Image Encoder: unsupported file extension .${fileExt}`,
      )
      return
    }

    const stat = await statSafe(target)
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
    const mode: 'encode' | 'inspect' = fileExt === 'png' ? 'encode' : 'inspect'

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(target, '..'),
      ],
    }

    const renderHtml = async () =>
      composeToolHtml({
        webview: panel.webview,
        tool: TOOL,
        extensionUri: this.context.extensionUri,
      })

    panel.webview.html = await renderHtml()

    const bridge = createHostBridge(panel.webview)

    bridge.on('encode/ready', async () => {
      log(`encode/ready for ${fileName} (${mode})`)
      bridge.emit('encode/init', {
        fileName,
        sourceBytes: Array.from(sourceBytes),
        mode,
      })
      return { ok: true }
    })

    bridge.on<{ format: 'webp' | 'avif' | 'ktx2'; bytes: number[]; suggestedFilename: string }>(
      'encode/save',
      async ({ format, bytes, suggestedFilename }) => {
        if (mode === 'inspect') {
          return { ok: false, cancelled: true, reason: 'save disabled in inspect mode' }
        }
        const dest = vscode.Uri.joinPath(target, '..', suggestedFilename)
        const existing = await statSafe(dest)
        if (existing) {
          const choice = await vscode.window.showWarningMessage(
            `${suggestedFilename} already exists. Overwrite?`,
            { modal: true },
            'Overwrite',
          )
          if (choice !== 'Overwrite') {
            return { ok: false, cancelled: true }
          }
        }
        await vscode.workspace.fs.writeFile(dest, new Uint8Array(bytes))
        log(`encode/save wrote ${dest.fsPath} (${bytes.length} bytes, ${format})`)
        return { ok: true, savedUri: dest.toString() }
      },
    )

    bridge.on('encode/reveal-folder', async () => {
      await vscode.commands.executeCommand('revealFileInOS', target)
      return { ok: true }
    })

    bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
      log(`[webview:${level}]`, ...args)
      return { ok: true }
    })

    const disposeReload = setupDevReload(this.context.extensionUri, TOOL, () =>
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
}

async function statSafe(uri: vscode.Uri): Promise<vscode.FileStat | null> {
  try {
    return await vscode.workspace.fs.stat(uri)
  } catch {
    return null
  }
}

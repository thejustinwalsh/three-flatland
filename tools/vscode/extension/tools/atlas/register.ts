import * as vscode from 'vscode'
import { AtlasCustomEditorProvider } from './provider'

export function registerAtlasTool(context: vscode.ExtensionContext): void {
  // CustomEditor: handles `vscode.openWith(uri, 'threeFlatland.atlas')` and
  // the "Reopen Editor With..." pathway.
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      AtlasCustomEditorProvider.viewType,
      new AtlasCustomEditorProvider(context),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: false },
      }
    )
  )

  // Explorer/palette command: opens the active resource in our CustomEditor.
  // Accepts either an image (foo.png) or its sidecar (foo.atlas.json) — when
  // invoked on a sidecar we resolve back to the associated image so the
  // editor opens on the right document.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.atlas.openEditor',
      async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri
        if (!target) {
          void vscode.window.showErrorMessage('FL Sprite Atlas: no file selected.')
          return
        }
        const resolved = await resolveImageForCommand(target)
        if (!resolved) {
          const name = target.path.split('/').pop() ?? target.fsPath
          void vscode.window.showErrorMessage(
            `FL Sprite Atlas: no matching image found for ${name}.`,
          )
          return
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          resolved,
          AtlasCustomEditorProvider.viewType,
        )
      }
    )
  )
}

/**
 * Map a click target to the image URI the atlas editor should open. Sidecar
 * inputs (`foo.atlas.json`) are resolved to the matching image by stripping
 * `.atlas.json` and trying each supported image extension in priority
 * order. Returns null when no matching image exists in the same directory.
 */
async function resolveImageForCommand(uri: vscode.Uri): Promise<vscode.Uri | null> {
  const path = uri.path
  if (!path.endsWith('.atlas.json')) return uri
  const base = path.slice(0, -'.atlas.json'.length)
  // PNG only at v0; spec calls for WebP/AVIF/KTX2 in future passes.
  const exts = ['.png']
  for (const ext of exts) {
    const candidate = uri.with({ path: base + ext })
    try {
      const stat = await vscode.workspace.fs.stat(candidate)
      if (stat.type === vscode.FileType.File) return candidate
    } catch {
      // ENOENT — try next extension
    }
  }
  return null
}

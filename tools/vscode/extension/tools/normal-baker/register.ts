import * as vscode from 'vscode'
import { openNormalBakerPanel } from './host'
import { pngPathFromNormalJson } from './paths'
import { isToolEnabled } from '../../toolRegistry'

/**
 * Maps a click target to the source PNG the baker should open. A `.png`
 * opens directly; a `.normal.json` sidecar resolves to its paired source
 * image via `pngPathFromNormalJson` (pure string derivation — normal-baker's
 * naming convention is a fixed suffix swap, no need to read the sidecar's
 * contents the way atlas's `resolveImageForCommand` has to for `meta.sources`).
 * Returns `null` — never throws — for anything else, or when the derived
 * PNG doesn't actually exist on disk (a stale/renamed sidecar).
 */
async function resolveImageForCommand(uri: vscode.Uri): Promise<vscode.Uri | null> {
  if (uri.path.toLowerCase().endsWith('.png')) return uri

  const pngPath = pngPathFromNormalJson(uri.path)
  if (!pngPath) return null
  const candidate = uri.with({ path: pngPath })
  try {
    const stat = await vscode.workspace.fs.stat(candidate)
    return stat.type === vscode.FileType.File ? candidate : null
  } catch {
    return null
  }
}

export function registerNormalBakerTool(context: vscode.ExtensionContext): vscode.Disposable {
  const disposable = vscode.commands.registerCommand(
    'threeFlatland.normalBaker.open',
    async (clicked?: vscode.Uri) => {
      // Defense in depth: the explorer/context and command-palette menu
      // items are already gated on the tool's context key, but a
      // keybinding can still invoke the command id directly.
      if (!isToolEnabled('normalBaker')) {
        void vscode.window.showInformationMessage('FL Normal Baker is disabled in Settings.')
        return
      }
      const target = clicked ?? vscode.window.activeTextEditor?.document.uri
      if (!target) {
        void vscode.window.showErrorMessage('FL Normal Baker: select a PNG file first.')
        return
      }
      const resolved = await resolveImageForCommand(target)
      if (!resolved) {
        void vscode.window.showErrorMessage(
          'FL Normal Baker: select a PNG file (or its .normal.json sidecar) first.'
        )
        return
      }
      await openNormalBakerPanel(context, resolved)
    }
  )
  return vscode.Disposable.from(disposable)
}

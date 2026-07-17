import * as vscode from 'vscode'
import { openNormalBakerPanel } from './host'
import { pngPathFromNormalJson, sourcePngFromNormalPng } from './paths'
import { isToolEnabled } from '../../toolRegistry'

/** The derived candidate exists as a real file on disk, or `null`. */
async function existingFileOrNull(candidate: vscode.Uri): Promise<vscode.Uri | null> {
  try {
    const stat = await vscode.workspace.fs.stat(candidate)
    return stat.type === vscode.FileType.File ? candidate : null
  } catch {
    return null
  }
}

/**
 * Maps a click target to the SOURCE PNG the baker should bake from. Either
 * half of a pair resolves to the same source, so opening the wrong file is
 * hard to do:
 * - a baked normal map `X.normal.png` (the bake OUTPUT) resolves to its
 *   source `X.png` — opening the generated map instead of the tileset is an
 *   easy slip, so we hot-swap rather than bake from a normal map;
 * - a `.normal.json` sidecar resolves to its paired source image;
 * - a plain source `X.png` opens directly.
 * Both derived cases are pure string derivation (normal-baker's naming is a
 * fixed suffix swap — no need to read sidecar contents the way atlas's
 * `resolveImageForCommand` does for `meta.sources`) and are confirmed to
 * exist on disk before use. Returns `null` — never throws — for anything
 * else, or when the derived source doesn't exist (a stale/renamed sidecar
 * or an orphaned normal map). The `.normal.png` check MUST precede the
 * plain-`.png` branch, since `X.normal.png` also ends in `.png`.
 */
async function resolveImageForCommand(uri: vscode.Uri): Promise<vscode.Uri | null> {
  const sourceFromNormalPng = sourcePngFromNormalPng(uri.path)
  if (sourceFromNormalPng) return existingFileOrNull(uri.with({ path: sourceFromNormalPng }))

  if (uri.path.toLowerCase().endsWith('.png')) return uri

  const pngPath = pngPathFromNormalJson(uri.path)
  if (!pngPath) return null
  return existingFileOrNull(uri.with({ path: pngPath }))
}

export function registerNormalBakerTool(context: vscode.ExtensionContext): vscode.Disposable {
  const disposable = vscode.commands.registerCommand('threeFlatland.normalBaker.open', async (clicked?: vscode.Uri) => {
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
        'FL Normal Baker: select a source PNG (or its .normal.json / .normal.png sidecar) first.'
      )
      return
    }
    await openNormalBakerPanel(context, resolved)
  })
  return vscode.Disposable.from(disposable)
}

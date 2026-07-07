import * as vscode from 'vscode'
import { registerAtlasTool } from './tools/atlas/register'
import { registerMergeTool } from './tools/merge/register'
import { registerEncodeTool } from './tools/encode/register'
import { registerWasmTest } from './tools/_wasm-test/register'
import { registerZzfxTool } from './tools/zzfx/register'
import { getActivePlaySidecarPid, shutdownPlaySidecar } from './tools/zzfx/playSidecarManager'
import { getChannel, log } from './log'

/**
 * Programmatic API returned from `activate()` — VS Code's standard
 * `exports` pattern (`vscode.extensions.getExtension(id)!.exports`), same
 * mechanism the built-in Git extension uses to expose its `git.API`. Kept
 * intentionally small: a diagnostic surface for the zzfx-play sidecar
 * (real AudioContext, no webview panel — see `tools/zzfx-play/CLAUDE.md`),
 * not a general extensibility API. `getActivePid`/`shutdown` are exactly
 * the functions `playSidecarManager.ts` itself uses — `shutdown` is the
 * same call `context.subscriptions`' dispose handler makes on a real
 * deactivation, not a separate test-only path.
 */
export type ExtensionApi = {
  zzfxPlay: {
    getActivePid: () => number | undefined
    shutdown: () => Promise<void>
  }
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  context.subscriptions.push(getChannel())
  log('activate: @three-flatland/vscode')
  registerAtlasTool(context)
  registerMergeTool(context)
  registerEncodeTool(context)
  registerWasmTest(context)
  registerZzfxTool(context)
  log(`activate: extensionUri = ${context.extensionUri.fsPath}`)

  return {
    zzfxPlay: {
      getActivePid: getActivePlaySidecarPid,
      shutdown: shutdownPlaySidecar,
    },
  }
}

export function deactivate(): void {
  log('deactivate')
}

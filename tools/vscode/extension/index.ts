import * as vscode from 'vscode'
import type { PlaybackStats } from '@three-flatland/zzfx-play'
import { registerWasmTest } from './tools/_wasm-test/register'
import {
  getActivePlaySidecarPid,
  getPlaySidecarStats,
  shutdownPlaySidecar,
} from './tools/zzfx/playSidecarManager'
import { activateTools, watchToolConfiguration } from './toolRegistry'
import { getChannel, log } from './log'

/**
 * Programmatic API returned from `activate()` — VS Code's standard
 * `exports` pattern (`vscode.extensions.getExtension(id)!.exports`), same
 * mechanism the built-in Git extension uses to expose its `git.API`. Kept
 * intentionally small: a diagnostic surface for the zzfx-play sidecar
 * (real AudioContext, no webview panel — see `tools/zzfx-play/CLAUDE.md`),
 * not a general extensibility API. `getActivePid`/`shutdown`/`getStats`
 * are exactly the functions `playSidecarManager.ts` itself uses —
 * `shutdown` is the same call `context.subscriptions`' dispose handler
 * makes on a real deactivation, not a separate test-only path. `getStats`
 * is the audibility regression guard (see `tools/zzfx-play/src/player.ts`)
 * — an e2e test drives it to prove a played sound actually reaches the
 * output, not just that `play` acked clean.
 */
export type ExtensionApi = {
  zzfxPlay: {
    getActivePid: () => number | undefined
    shutdown: () => Promise<void>
    getStats: () => Promise<PlaybackStats | undefined>
  }
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  context.subscriptions.push(getChannel())
  log('activate: @three-flatland/vscode')
  // User-toggleable tools (threeFlatland.tools.*.enabled) — see
  // toolRegistry.ts for the single-point-of-extension registry contract.
  activateTools(context)
  watchToolConfiguration(context)
  // Not user-toggleable — a dev/e2e-only diagnostic panel, no
  // package.json menu surface to disable it from.
  registerWasmTest(context)
  log(`activate: extensionUri = ${context.extensionUri.fsPath}`)

  return {
    zzfxPlay: {
      getActivePid: getActivePlaySidecarPid,
      shutdown: shutdownPlaySidecar,
      getStats: getPlaySidecarStats,
    },
  }
}

export function deactivate(): void {
  log('deactivate')
}

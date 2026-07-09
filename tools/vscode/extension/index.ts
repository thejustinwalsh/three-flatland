import * as vscode from 'vscode'
import type { PlaybackStats } from '@three-flatland/audio-play'
import { registerWasmTest } from './tools/_wasm-test/register'
import type { ZzfxHistoryBatch } from '../webview/audio/protocol'
import { historyKeyFor } from './tools/audio/history/core'
import { getZzfxHistoryStore } from './tools/audio/history/store'
import {
  getActivePlaySidecarPid,
  getPlaySidecarStats,
  shutdownPlaySidecar,
} from './tools/audio/playSidecarManager'
import { shutdownSidecar } from './tools/audio/sidecarManager'
import { activateTools, watchToolConfiguration } from './toolRegistry'
import { getChannel, log } from './log'

/**
 * Programmatic API returned from `activate()` — VS Code's standard
 * `exports` pattern (`vscode.extensions.getExtension(id)!.exports`), same
 * mechanism the built-in Git extension uses to expose its `git.API`. Kept
 * intentionally small: a diagnostic surface for the audio-play sidecar
 * (real AudioContext, no webview panel — see `tools/audio-play/CLAUDE.md`),
 * not a general extensibility API. `getActivePid`/`shutdown`/`getStats`
 * are exactly the functions `playSidecarManager.ts` itself uses —
 * `shutdown` is the same call `context.subscriptions`' dispose handler
 * makes on a real deactivation, not a separate test-only path. `getStats`
 * is the audibility regression guard (see `tools/audio-play/src/player.ts`)
 * — an e2e test drives it to prove a played sound actually reaches the
 * output, not just that `play` acked clean.
 */
export type ExtensionApi = {
  zzfxPlay: {
    getActivePid: () => number | undefined
    shutdown: () => Promise<void>
    getStats: () => Promise<PlaybackStats | undefined>
  }
  /** e2e seeding/verification seam for the AI candidate history — the
   * SAME singleton store instance the zzfx panels use (not a parallel
   * path), so a seeded batch is exactly what a panel's init reads. The
   * generate→persist route itself can't be driven e2e (the test host has
   * no `vscode.lm` model, so generate degrades to presets, which are by
   * design never persisted) — it's covered by history/core.test.ts's
   * `batchFromOutcome` + append tests instead. */
  zzfxHistory: {
    keyFor: typeof historyKeyFor
    getBatches: (key: string) => Promise<ZzfxHistoryBatch[]>
    append: (key: string, batch: ZzfxHistoryBatch) => Promise<ZzfxHistoryBatch[]>
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
    zzfxHistory: {
      keyFor: historyKeyFor,
      getBatches: (key) => getZzfxHistoryStore(context).getBatches(key),
      append: (key, batch) => getZzfxHistoryStore(context).append(key, batch),
    },
  }
}

export async function deactivate(): Promise<void> {
  log('deactivate')
  // Await the sidecar shutdowns rather than firing them and returning.
  // Both are idempotent and each bounds itself with a SIGKILL fallback
  // (see sidecarManager/playSidecarManager), so this can't hang — but it
  // MUST be awaited: otherwise the extension host tears down while the
  // codelens-service / audio-play child processes are still alive, orphans
  // them, and (under the single-session e2e's one final teardown) leaves
  // app.close() waiting forever. The dispose handlers in audio/register.ts
  // still call these too; the idempotent guard makes the double-call a
  // no-op. A real user closing VS Code gets the same clean cleanup.
  await Promise.allSettled([shutdownSidecar(), shutdownPlaySidecar()])
}

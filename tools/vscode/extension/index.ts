import * as vscode from 'vscode'
import type { PlaybackStats } from '@three-flatland/audio-play'
import { registerWasmTest } from './tools/_wasm-test/register'
import type { ZzfxHistoryBatch } from '../webview/audio/protocol'
import { historyKeyFor } from './tools/audio/history/core'
import { getZzfxHistoryStore } from './tools/audio/history/store'
import {
  getActivePlaySidecarPid,
  getPlaySidecarStats,
  pingPlaySidecar,
  shutdownPlaySidecar,
} from './tools/audio/playSidecarManager'
import { getZzfxCodeLensProvider } from './tools/audio/register'
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
 * output, not just that `play` acked clean. `ping` is the device-independent
 * counterpart (see `tools/audio-play/CLAUDE.md`'s device-tolerance
 * section): proves the sidecar PROCESS is alive and responding over the
 * wire protocol without touching `AudioContext` at all, so it stays
 * meaningful even on a device-less runner where `getStats`/a real `play`
 * legitimately Nacks.
 */
export type ExtensionApi = {
  zzfxPlay: {
    getActivePid: () => number | undefined
    shutdown: () => Promise<void>
    getStats: () => Promise<PlaybackStats | undefined>
    ping: () => Promise<boolean>
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
  /** e2e determinism seam (planning/testing/test-determinism-audit.md):
   * subscribes to the zzfx CodeLens provider's own `onDidChangeCodeLenses`
   * refresh signal — fired when `audioFileResolver.ts`'s async fallback
   * search settles or a play-time repair changes an answer (see
   * `tools/audio/provider.ts`). Lets e2e specs await the CAUSAL "lenses
   * changed" event instead of polling `vscode.executeCodeLensProvider` to
   * a wall-clock deadline. Throws if the audio tool isn't currently
   * registered (disabled via settings) rather than returning a listener
   * that would silently never fire. */
  zzfxCodeLens: {
    onDidChangeCodeLenses: (listener: () => void) => vscode.Disposable
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
      ping: pingPlaySidecar,
    },
    zzfxHistory: {
      keyFor: historyKeyFor,
      getBatches: (key) => getZzfxHistoryStore(context).getBatches(key),
      append: (key, batch) => getZzfxHistoryStore(context).append(key, batch),
    },
    zzfxCodeLens: {
      onDidChangeCodeLenses: (listener) => {
        const provider = getZzfxCodeLensProvider()
        if (!provider) {
          throw new Error(
            'zzfxCodeLens.onDidChangeCodeLenses: audio tool is not active — no CodeLens provider registered.'
          )
        }
        return provider.onDidChangeCodeLenses(listener)
      },
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

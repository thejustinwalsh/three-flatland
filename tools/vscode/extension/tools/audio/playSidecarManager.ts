// Singleton lifecycle for the audio-play sidecar (real AudioContext, no
// webview panel) — mirrors sidecarManager.ts's pattern for the
// codelens-service client. Degrades gracefully: any failure to resolve
// the sidecar script or spawn the process logs and returns `null` rather
// than throwing — callers fall back to the panel-based play route (see
// register.ts) rather than surfacing an error to the user for something
// that's just an inline-playback convenience.
import * as fs from 'node:fs'
import * as vscode from 'vscode'
import { PlaySidecarClient, type PlaybackStats } from '@three-flatland/audio-play'
import { log } from '../../log'

let client: PlaySidecarClient | undefined

/**
 * Returns the shared sidecar client, spawning it on first call. Returns
 * `null` (never throws) if the sidecar script can't be resolved on disk —
 * callers must fall back to the panel-based play route. Unlike
 * `getSidecarClient` (codelens-service), this doesn't need to await a
 * handshake: `PlaySidecarClient.play()`/`playSong()` spawn lazily and
 * write to the process's stdin directly, so there's no async
 * "initialize" step to block on here.
 */
export function getPlaySidecarClient(context: vscode.ExtensionContext): PlaySidecarClient | null {
  if (client) return client

  const sidecarPath = resolveSidecarPath(context)
  if (!sidecarPath) {
    log('audio-play: sidecar script not found — inline playback disabled')
    return null
  }

  const created = new PlaySidecarClient({ execPath: process.execPath, sidecarPath })
  created.onError((err) => log(`audio-play: ${err.message}`))
  created.onExit((code, signal) => {
    log(`audio-play: sidecar exited (code=${code}, signal=${signal})`)
    // Let the next getPlaySidecarClient() call respawn rather than
    // staying permanently unusable for the rest of the session.
    if (client === created) client = undefined
  })
  client = created
  return created
}

/**
 * Production (VSIX-packaged) candidate path — bundling `dist/sidecar.js`
 * + its `node-web-audio-api` native deps into the VSIX is tracked
 * separately (task #24, same as codelens-service's per-platform binary
 * bundling); the resolution order is wired up now so that work has
 * nothing to change here when it lands.
 */
function productionSidecarPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, 'audio-play', 'sidecar.js').fsPath
}

/**
 * Dev-mode candidate: `tools/audio-play/` is a sibling of `tools/vscode/`
 * in this monorepo. `context.extensionUri` is VS Code's own knowledge of
 * where the extension is actually loaded from
 * (`--extensionDevelopmentPath` in dev/e2e) — independent of esbuild's
 * `import.meta.url` rewriting once this module is bundled into
 * `dist/extension.js` (same reasoning as `sidecarManager.ts`'s
 * `devCandidates`).
 */
function devSidecarPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, '..', 'audio-play', 'dist', 'sidecar.js').fsPath
}

function resolveSidecarPath(context: vscode.ExtensionContext): string | null {
  for (const candidate of [productionSidecarPath(context), devSidecarPath(context)]) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** The currently running sidecar's OS process id, or `undefined` if none is spawned. Diagnostic surface — see `extension/index.ts`'s `activate()` return value. */
export function getActivePlaySidecarPid(): number | undefined {
  return client?.pid
}

/**
 * The audibility regression guard's extension-side entry point — `undefined`
 * if no sidecar is currently running (nothing to query), never spawns one
 * just to ask. See `@three-flatland/audio-play`'s `PlaySidecarClient.getStats`
 * for what's actually being measured.
 */
export async function getPlaySidecarStats(): Promise<PlaybackStats | undefined> {
  if (!client) return undefined
  return client.getStats()
}

/** Graceful shutdown, called from the extension's `deactivate()`. */
export async function shutdownPlaySidecar(): Promise<void> {
  if (!client) return
  const current = client
  client = undefined
  try {
    await current.shutdown()
  } catch {
    current.dispose()
  }
}

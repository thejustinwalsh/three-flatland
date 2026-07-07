// Singleton lifecycle for the codelens-service Rust sidecar, shared by the
// CodeLens provider and both zzfx commands (playAtCursor/openEditor all
// need the same running process, not one each). Degrades gracefully: any
// failure to resolve/spawn/initialize the binary logs and returns `null`
// rather than throwing — a missing/unbuilt sidecar must not crash
// extension activation or block the other three tools.
import * as vscode from 'vscode'
import { CodelensServiceClient, resolveBinary } from '@three-flatland/codelens-service'
import { log } from '../../log'

let clientPromise: Promise<CodelensServiceClient | null> | null = null

/**
 * Returns the shared sidecar client, spawning + initializing it on first
 * call. Safe to call concurrently — all callers await the same in-flight
 * start. Returns `null` (never rejects) if the sidecar is unavailable for
 * any reason: no workspace open, binary not found (not `cargo build`-ed
 * locally), or the `initialize` handshake failing.
 */
export function getSidecarClient(
  context: vscode.ExtensionContext
): Promise<CodelensServiceClient | null> {
  if (!clientPromise)
    clientPromise = startSidecar(context).catch((err) => {
      log(
        `zzfx sidecar: unexpected error starting: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
      )
      return null
    })
  return clientPromise
}

/**
 * `resolveBinary()`'s own dev-mode fallback resolves candidates relative
 * to its OWN `import.meta.url` — correct when that module runs from its
 * real `tools/codelens-service/dist/resolveBinary.js` location, but wrong
 * once esbuild bundles it INTO `tools/vscode/dist/extension.js`:
 * `import.meta.url` then points at the bundle's own location, so the
 * relative walk lands on `tools/vscode/sidecar/target/...` (nonexistent)
 * instead of `tools/codelens-service/sidecar/target/...`. Confirmed via a
 * real e2e run — `resolveBinary()` alone reported "binary not found" at
 * exactly that wrong path.
 *
 * `context.extensionUri` sidesteps this entirely: it's VS Code's own
 * knowledge of where the extension is actually loaded from
 * (`--extensionDevelopmentPath` in dev/e2e), completely independent of
 * any bundler's `import.meta.url` rewriting. `tools/codelens-service/` is
 * a sibling of `tools/vscode/` in this monorepo, so walking `../` from
 * the extension root reaches it directly.
 *
 * Dev-mode only — production/VSIX packaging would need the sidecar
 * binary bundled INTO the VSIX itself (a platform-specific `candidates`
 * path resolved from `context.extensionUri` directly, `includeDevFallback:
 * false`) — not wired up in this unit.
 */
function devCandidates(context: vscode.ExtensionContext): string[] {
  const binaryName = process.platform === 'win32' ? 'codelens-service.exe' : 'codelens-service'
  const sidecarTarget = vscode.Uri.joinPath(
    context.extensionUri,
    '..',
    'codelens-service',
    'sidecar',
    'target'
  )
  return [
    vscode.Uri.joinPath(sidecarTarget, 'release', binaryName).fsPath,
    vscode.Uri.joinPath(sidecarTarget, 'debug', binaryName).fsPath,
  ]
}

async function startSidecar(
  context: vscode.ExtensionContext
): Promise<CodelensServiceClient | null> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!workspaceRoot) {
    log('zzfx sidecar: no workspace folder open — CodeLenses disabled')
    return null
  }

  let binaryPath: string
  try {
    binaryPath = resolveBinary({ candidates: devCandidates(context), includeDevFallback: false })
  } catch (err) {
    log(
      `zzfx sidecar: binary not found — CodeLenses disabled: ${err instanceof Error ? err.message : err}`
    )
    return null
  }

  const client = new CodelensServiceClient({
    binaryPath,
    workspaceRoot,
    storageUri: context.globalStorageUri.fsPath,
  })

  try {
    const init = await client.start()
    log(
      `zzfx sidecar: started v${init.version}${init.degraded ? ' (degraded — in-memory cache)' : ''}`
    )
  } catch (err) {
    log(
      `zzfx sidecar: failed to start — CodeLenses disabled: ${err instanceof Error ? err.message : err}`
    )
    return null
  }

  client.stderr?.on('data', (chunk: Buffer) =>
    log(`zzfx sidecar[stderr]: ${chunk.toString('utf8').trim()}`)
  )
  client.onError((err) => log(`zzfx sidecar: ${err.message}`))
  client.onExit((code, signal) => {
    log(`zzfx sidecar: exited (code=${code}, signal=${signal})`)
    // Let the next getSidecarClient() call respawn rather than staying
    // permanently null for the rest of the session.
    clientPromise = null
  })

  return client
}

/** Graceful shutdown, called from the extension's `deactivate()`. */
export async function shutdownSidecar(): Promise<void> {
  if (!clientPromise) return
  const client = await clientPromise
  clientPromise = null
  if (!client) return
  try {
    await client.shutdown()
  } catch {
    client.dispose()
  }
}

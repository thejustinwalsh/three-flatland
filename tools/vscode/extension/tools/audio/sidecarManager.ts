// Singleton lifecycle for the codelens-service Rust sidecar, shared by the
// CodeLens provider and both zzfx commands (playAtCursor/openEditor all
// need the same running process, not one each). Degrades gracefully: any
// failure to resolve/spawn/initialize the binary logs and returns `null`
// rather than throwing — a missing/unbuilt sidecar must not crash
// extension activation or block the other three tools.
import * as vscode from 'vscode'
import { CodelensServiceClient, preferNewest, resolveBinary } from '@three-flatland/codelens-service'
import { log } from '../../log'

let clientPromise: Promise<CodelensServiceClient | null> | null = null

/**
 * Returns the shared sidecar client, spawning + initializing it on first
 * call. Safe to call concurrently — all callers await the same in-flight
 * start. Returns `null` (never rejects) if the sidecar is unavailable for
 * any reason: no workspace open, binary not found (not `cargo build`-ed
 * locally), or the `initialize` handshake failing.
 */
export function getSidecarClient(context: vscode.ExtensionContext): Promise<CodelensServiceClient | null> {
  if (!clientPromise)
    clientPromise = startSidecar(context).catch((err) => {
      log(`zzfx sidecar: unexpected error starting: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
      return null
    })
  return clientPromise
}

const BINARY_NAME = process.platform === 'win32' ? 'codelens-service.exe' : 'codelens-service'

/**
 * Production (VSIX-packaged) candidate path, per the convention documented
 * in `tools/codelens-service/CLAUDE.md`: `<extensionUri>/bin/<platform>-
 * <arch>/codelens-service`. Actually bundling the binary into the VSIX at
 * that path is out of scope for this unit — packaging is a separate,
 * later concern — but the resolution order is wired up now so that work
 * has nothing to change here when it lands.
 */
function productionCandidates(context: vscode.ExtensionContext): string[] {
  const platformDir = `${process.platform}-${process.arch}`
  return [vscode.Uri.joinPath(context.extensionUri, 'bin', platformDir, BINARY_NAME).fsPath]
}

/**
 * `resolveBinary()`'s own dev-mode fallback (`includeDevFallback: true`,
 * or its default) resolves candidates relative to its OWN
 * `import.meta.url` — correct when that module runs from its real
 * `tools/codelens-service/dist/resolveBinary.js` location, but wrong once
 * esbuild bundles it INTO `tools/vscode/dist/extension.js`: `import.meta
 * .url` then points at the bundle's own location, so the relative walk
 * lands on `tools/vscode/sidecar/target/...` (nonexistent) instead of
 * `tools/codelens-service/sidecar/target/...`. Confirmed via a real e2e
 * run — `resolveBinary()` alone reported "binary not found" at exactly
 * that wrong path. This is why `resolveBinary()` is called below with
 * `includeDevFallback: false` — its broken fallback would otherwise still
 * be appended after these candidates, risking a worse error or (if a
 * stray local `target/` happened to exist at the wrong relative location
 * some workspace layout could produce) silently picking up the wrong
 * binary. This function exists to serve exactly the role
 * `includeDevFallback: true` would have, just anchored correctly.
 *
 * `context.extensionUri` sidesteps this entirely: it's VS Code's own
 * knowledge of where the extension is actually loaded from
 * (`--extensionDevelopmentPath` in dev/e2e), completely independent of
 * any bundler's `import.meta.url` rewriting. `tools/codelens-service/` is
 * a sibling of `tools/vscode/` in this monorepo, so walking `../` from
 * the extension root reaches it directly.
 */
function devCandidates(context: vscode.ExtensionContext): string[] {
  const sidecarTarget = vscode.Uri.joinPath(context.extensionUri, '..', 'codelens-service', 'sidecar', 'target')
  // preferNewest, not release-then-debug: a stale week-old `--release`
  // build (packaging leftover) must never shadow the fresh debug binary a
  // `cargo build`/`cargo test` iteration just produced — a real e2e run
  // silently tested pre-change parsing exactly this way.
  return preferNewest([
    vscode.Uri.joinPath(sidecarTarget, 'release', BINARY_NAME).fsPath,
    vscode.Uri.joinPath(sidecarTarget, 'debug', BINARY_NAME).fsPath,
  ])
}

async function startSidecar(context: vscode.ExtensionContext): Promise<CodelensServiceClient | null> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!workspaceRoot) {
    log('zzfx sidecar: no workspace folder open — CodeLenses disabled')
    return null
  }

  let binaryPath: string
  try {
    // Any source-tree host — dev launch (Development) OR e2e
    // (--extensionTestsPath, Test) — prefers the fresh cargo build over
    // `tools/vscode/bin/` (gitignored local packaging output that can go
    // stale). `!== Production` covers both; only a real installed extension
    // is production-first. Same stale-artifact-shadowing reasoning (and the
    // same Test-mode gap) as playSidecarManager.ts's resolveSidecarPath.
    const candidates =
      context.extensionMode !== vscode.ExtensionMode.Production
        ? [...devCandidates(context), ...productionCandidates(context)]
        : [...productionCandidates(context), ...devCandidates(context)]
    binaryPath = resolveBinary({ candidates, includeDevFallback: false })
    // Provenance — same reasoning as playSidecarManager.ts's
    // `sidecar resolved →` line: name which artifact actually runs.
    log(`zzfx sidecar: binary resolved → ${binaryPath}`)
  } catch (err) {
    log(`zzfx sidecar: binary not found — CodeLenses disabled: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }

  // Workspace-scoped, not context.globalStorageUri — the sidecar's SQLite
  // cache is per-project (file paths/hashes only make sense scoped to the
  // workspace that produced them). `context.storageUri` is undefined only
  // when no workspace is open, which the check above already ruled out;
  // the globalStorageUri fallback is defensive for any edge case VS Code
  // itself doesn't document (e.g. an untrusted workspace).
  const storageUri = context.storageUri?.fsPath ?? context.globalStorageUri.fsPath
  const client = new CodelensServiceClient({
    binaryPath,
    workspaceRoot,
    storageUri,
  })

  try {
    const init = await client.start()
    log(`zzfx sidecar: started v${init.version}${init.degraded ? ' (degraded — in-memory cache)' : ''}`)
  } catch (err) {
    log(`zzfx sidecar: failed to start — CodeLenses disabled: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }

  client.stderr?.on('data', (chunk: Buffer) => log(`zzfx sidecar[stderr]: ${chunk.toString('utf8').trim()}`))
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

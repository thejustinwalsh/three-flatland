/**
 * Resolves the path to the `codelens-service` binary. Deliberately
 * decoupled from `CodelensServiceClient` (which just takes a `binaryPath`
 * string) so a consumer — e.g. a VSIX-packaged VS Code extension with its
 * own platform-specific bundled paths — can layer additional candidates on
 * top without this package needing to know about VSIX layout at all.
 */

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BINARY_NAME = process.platform === 'win32' ? 'codelens-service.exe' : 'codelens-service'

/**
 * Orders dev-build candidate paths so existing binaries come first, newest
 * build (mtime) winning. A fresh `cargo build`/`cargo test` debug binary
 * must never lose to a week-old `--release` artifact left behind by a
 * packaging run — the same stale-artifact-shadowing class the VS Code
 * extension's Test-mode resolution fix covers, one directory deeper.
 * Stable-sorts, so ties and all-missing keep the caller's order.
 */
export function preferNewest(paths: string[]): string[] {
  // -1, not -Infinity: two missing paths must compare equal (a NaN from
  // `-Infinity - -Infinity` would make the comparator inconsistent).
  const mtime = (path: string) => (existsSync(path) ? statSync(path).mtimeMs : -1)
  return [...paths].sort((a, b) => mtime(b) - mtime(a))
}

/**
 * The locally `cargo build`-produced binary paths, newest build preferred
 * (see {@link preferNewest}). `src/` and `dist/` are siblings directly under
 * `tools/codelens-service/`, so this resolves correctly whether called from
 * source (vitest/tsx) or from the compiled `dist/` output.
 */
export function devBinaryCandidates(): string[] {
  const sidecarTarget = fileURLToPath(new URL('../sidecar/target', import.meta.url))
  return preferNewest([
    join(sidecarTarget, 'release', BINARY_NAME),
    join(sidecarTarget, 'debug', BINARY_NAME),
  ])
}

export interface ResolveBinaryOptions {
  /**
   * Explicit override. If given, it is returned as-is — no existence check —
   * since the caller (e.g. a VS Code extension resolving its own bundled
   * path) is asserting this is correct.
   */
  explicitPath?: string
  /** Additional candidate paths to probe, in order, before the dev-mode fallback. */
  candidates?: string[]
  /**
   * Whether to append {@link devBinaryCandidates} after `candidates`.
   * Defaults to `true`. A packaged (VSIX) production build should pass
   * `false` — it has no business silently picking up a stray local cargo
   * build on the user's machine if its own bundled candidates all miss.
   */
  includeDevFallback?: boolean
}

/**
 * Resolution precedence: `explicitPath` (if given) > first existing entry in
 * `candidates` > (if `includeDevFallback`, the default) newest existing
 * dev-mode `target/{release,debug}` build. Throws with every path it looked
 * at if nothing resolves — a silent `undefined` here just becomes a
 * confusing ENOENT three calls later.
 */
export function resolveBinary(options: ResolveBinaryOptions = {}): string {
  if (options.explicitPath) return options.explicitPath

  const candidates = [
    ...(options.candidates ?? []),
    ...(options.includeDevFallback === false ? [] : devBinaryCandidates()),
  ]
  const found = candidates.find((path) => existsSync(path))
  if (found) return found

  throw new Error(
    `codelens-service binary not found. Looked in:\n${candidates.map((c) => `  - ${c}`).join('\n')}\n` +
      'Build it with `cargo build` (or `cargo build --release`) in tools/codelens-service/sidecar/, ' +
      'or pass an explicit path via ResolveBinaryOptions.explicitPath.'
  )
}

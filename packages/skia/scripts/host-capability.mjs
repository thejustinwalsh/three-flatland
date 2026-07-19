// Host-capability probe for the Zig -> WASM toolchain.
//
// macOS 26.4+/27 dropped the plain `arm64-macos` slice from libSystem's
// sub-library stubs (only `arm64e-macos` remains), so Zig can't link ANY
// native binary there — including its own build runner — and the from-source
// WASM build is impossible. See https://codeberg.org/ziglang/zig/issues/31658.
//
// CI/Linux links fine and builds from source, so it never trips this probe and
// stays the source of truth. On a host that can't build, callers fall back to
// the compiled lib/*.wasm committed to the repo (CI rebuilds + commits them on
// skia changes). We never fetch a remote prebuilt — that would overwrite the
// tracked libs and dirty git history.

import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname, join, delimiter } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const TOOLS_BIN = resolve(PKG_ROOT, '.tools/bin')

// Same PATH augmentation build-wasm.mjs / setup.mjs use, so the probe picks up
// the pinned Zig in .tools/bin when present.
const env = { ...process.env, PATH: `${TOOLS_BIN}${delimiter}${process.env.PATH}` }

/**
 * Can Zig link a trivial native binary on this host? Fast, deterministic, and
 * independent of the skia sources (an empty `main`), so it only gates on host
 * toolchain capability and never masks a real skia compile error. Returns
 * false when Zig is missing or the host can't link (the macOS 27 case).
 */
export function canBuildWasm() {
  const dir = mkdtempSync(join(tmpdir(), 'skia-zig-probe-'))
  try {
    writeFileSync(join(dir, 'probe.zig'), 'pub fn main() void {}\n')
    // Bound the probe so a hung linker (a failure mode this very check guards
    // against) fails fast into the committed-libs fallback instead of stalling.
    execSync('zig build-exe probe.zig -femit-bin=probe', {
      cwd: dir,
      stdio: 'ignore',
      env,
      timeout: 15_000,
    })
    return true
  } catch {
    return false
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

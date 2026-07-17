// Prebuilt-WASM fallback for hosts that can't build the Zig -> WASM toolchain.
//
// macOS 26.4+/27 dropped the plain `arm64-macos` slice from libSystem's
// sub-library stubs (only `arm64e-macos` remains), so Zig can't link ANY
// native binary there — including its own build runner — and the from-source
// WASM build is impossible. See https://codeberg.org/ziglang/zig/issues/31658.
//
// CI/Linux links fine and builds from source, so it never touches this path
// and stays the source of truth. Locally, we detect the broken host and fetch
// the CI-published WASM from npm (integrity-checked against prebuilt-wasm.json)
// instead of failing.

import { execSync, execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname, join, delimiter } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const DIST = resolve(PKG_ROOT, 'dist')
const TOOLS_BIN = resolve(PKG_ROOT, '.tools/bin')
const MANIFEST = resolve(PKG_ROOT, 'prebuilt-wasm.json')

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
    // against) fails fast into the prebuilt fallback instead of stalling setup.
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

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Fetch the CI-published WASM from npm (pinned in prebuilt-wasm.json), verify
 * each artifact's sha256, and write it into dist/. Returns true on success.
 *
 * Note: the prebuilt is keyed by a published version, not by a hash of the
 * local skia sources. If you've edited skia and can't build locally, this
 * silently serves the LAST published binary — build on Linux/CI to pick up
 * source changes. (A source-hash staleness guard is a reasonable follow-up.)
 */
export function fetchPrebuiltWasm(variants = ['gl', 'wgpu'], { dist = DIST } = {}) {
  if (!existsSync(MANIFEST)) {
    console.error(`  no prebuilt manifest at ${MANIFEST}`)
    return false
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const spec = `${manifest.package}@${manifest.version}`
  const wanted = variants.map((v) => `skia-${v}/skia-${v}.wasm`)
  if (wanted.length === 0) {
    console.error('  no variants requested')
    return false
  }
  // Require EVERY requested variant to be in the manifest. Silently dropping a
  // missing one would copy a partial set yet still report success, leaving a
  // variant's .wasm absent while callers believe prebuilt WASM is in place.
  const missing = wanted.filter((a) => !manifest.artifacts[a])
  if (missing.length > 0) {
    console.error(`  prebuilt manifest is missing artifact(s): ${missing.join(', ')}`)
    return false
  }
  const tmp = mkdtempSync(join(tmpdir(), 'skia-prebuilt-'))
  try {
    console.log(`  fetching prebuilt WASM from ${spec} ...`)
    const packed = JSON.parse(
      execFileSync('npm', ['pack', spec, '--pack-destination', tmp, '--json'], {
        cwd: tmp,
        encoding: 'utf8',
        env,
        timeout: 60_000,
      })
    )
    const tarball = resolve(tmp, packed[0].filename)
    const members = wanted.map((a) => `package/dist/${a}`)
    execFileSync('tar', ['-xzf', tarball, '-C', tmp, ...members], { cwd: tmp, timeout: 30_000 })
    for (const artifact of wanted) {
      const src = resolve(tmp, 'package/dist', artifact)
      if (!existsSync(src)) {
        console.error(`  ${artifact} missing from ${spec}`)
        return false
      }
      const expected = manifest.artifacts[artifact].replace(/^sha256:/, '')
      const actual = sha256(src)
      if (actual !== expected) {
        console.error(
          `  checksum mismatch for ${artifact}\n    expected ${expected}\n    got      ${actual}`
        )
        return false
      }
      mkdirSync(resolve(dist, dirname(artifact)), { recursive: true })
      copyFileSync(src, resolve(dist, artifact))
      console.log(`  ok ${artifact} (sha256 verified)`)
    }
    return true
  } catch (err) {
    console.error(`  prebuilt fetch failed: ${err.message}`)
    return false
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// CLI: `node scripts/prebuilt-wasm.mjs [gl|wgpu ...]`
// Portable entrypoint check — comparing a raw `file://` + argv[1] string breaks
// on Windows paths (backslashes) and isn't guaranteed by Node; resolve both to a
// canonical form instead.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const variants = process.argv.slice(2).filter((a) => ['gl', 'wgpu'].includes(a))
  process.exit(fetchPrebuiltWasm(variants.length ? variants : ['gl', 'wgpu']) ? 0 : 1)
}

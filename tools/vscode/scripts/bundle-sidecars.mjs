#!/usr/bin/env node
// Assembles the two native sidecars into the shapes
// `extension/tools/audio/sidecarManager.ts` (codelens-service) and
// `extension/tools/audio/playSidecarManager.ts` (audio-play)'s own
// `production*Path()` resolvers already expect — those were wired up
// ahead of this script existing (see their doc comments), so nothing on
// the resolution side needs to change now that it does.
//
// The packaged extension ships ONE universal VSIX with every platform's
// codelens-service binary bundled in (bin/<platform>-<arch>/), mirroring
// how audio-play's own node-web-audio-api dependency already ships all 7
// platforms' native binaries in a single npm install — sidecarManager.ts's
// `${process.platform}-${process.arch}` runtime lookup already handles
// "pick the right one at startup" with zero code changes either way.
// Simpler to build/publish than per-platform VSIX targets, at the cost of
// a bigger download for everyone — an accepted, deliberate tradeoff (see
// the PR discussion this design came out of), not an oversight.
//
// `cargo build --release` is never cross-compiled here — this script only
// ever produces the CURRENT machine's codelens-service binary. In CI, one
// matrix leg per target OS runs `--codelens-only` natively and uploads
// just its own `bin/<platform>-<arch>/`; a separate job downloads all
// five, runs `--audio-play-only` once (audio-play's output is
// platform-independent, so building it 5× would be pure waste), and
// packages the merged tree into the one universal VSIX. Locally (no
// flags), both run together for normal dev-mode convenience — that only
// ever produces the current platform's codelens-service binary, which is
// expected, not a bug.
//
// codelens-service (Rust binary, per-platform):
//   cargo build --release  →  bin/<platform>-<arch>/codelens-service[.exe]
//
// audio-play (Node sidecar script, platform-independent):
//   tools/audio-play builds with `bundle: false` deliberately (matches
//   codelens-service's own convention — see audio-play/CLAUDE.md's
//   "Building" section) so its normal `dist/sidecar.js` stays a thin,
//   multi-file ESM build for dev-mode use (`devSidecarPath()` in
//   playSidecarManager.ts still points there, untouched by this script).
//   For packaging we re-bundle that ALREADY-BUILT output into one
//   self-contained file with esbuild, marking only `node-web-audio-api`
//   (a native addon — can't be bundled as JS) external, then copy that
//   one package's real `node_modules` tree alongside it so Node's normal
//   module resolution finds it at runtime.
//
// Usage:
//   node scripts/bundle-sidecars.mjs                  # both (local dev)
//   node scripts/bundle-sidecars.mjs --codelens-only   # CI build leg
//   node scripts/bundle-sidecars.mjs --audio-play-only # CI assemble job
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VSCODE_ROOT = join(__dirname, '..')
const REPO_ROOT = join(VSCODE_ROOT, '..', '..')

const CODELENS_SIDECAR_DIR = join(REPO_ROOT, 'tools', 'codelens-service', 'sidecar')
const AUDIO_PLAY_DIR = join(REPO_ROOT, 'tools', 'audio-play')

// Matches sidecarManager.ts's `${process.platform}-${process.arch}` and
// vsce's own `--target` platform naming — same 5 targets task #24 scoped.
const PLATFORM_DIR = `${process.platform}-${process.arch}`
const BINARY_NAME = process.platform === 'win32' ? 'codelens-service.exe' : 'codelens-service'

function bundleCodelensService() {
  console.log(`[bundle-sidecars] cargo build --release (${PLATFORM_DIR})`)
  execFileSync('cargo', ['build', '--release'], { cwd: CODELENS_SIDECAR_DIR, stdio: 'inherit' })

  const outDir = join(VSCODE_ROOT, 'bin', PLATFORM_DIR)
  mkdirSync(outDir, { recursive: true })
  const src = join(CODELENS_SIDECAR_DIR, 'target', 'release', BINARY_NAME)
  const dest = join(outDir, BINARY_NAME)
  cpSync(src, dest)
  console.log(`[bundle-sidecars] wrote ${dest}`)
}

async function bundleAudioPlay() {
  console.log('[bundle-sidecars] pnpm --filter @three-flatland/audio-play build')
  execFileSync('pnpm', ['--filter', '@three-flatland/audio-play', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })

  const outDir = join(VSCODE_ROOT, 'audio-play')
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  console.log('[bundle-sidecars] re-bundling dist/sidecar.js for packaging')
  await esbuild.build({
    entryPoints: [join(AUDIO_PLAY_DIR, 'dist', 'sidecar.js')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['node-web-audio-api', 'node-web-audio-api/polyfill.js'],
    outfile: join(outDir, 'sidecar.js'),
    logLevel: 'info',
  })

  const nativeModuleSrc = join(AUDIO_PLAY_DIR, 'node_modules', 'node-web-audio-api')
  if (!existsSync(nativeModuleSrc)) {
    throw new Error(
      `[bundle-sidecars] node-web-audio-api not resolvable from ${AUDIO_PLAY_DIR} — run pnpm install first`
    )
  }
  const nativeModuleDest = join(outDir, 'node_modules', 'node-web-audio-api')
  mkdirSync(dirname(nativeModuleDest), { recursive: true })
  cpSync(nativeModuleSrc, nativeModuleDest, { recursive: true, dereference: true })
  console.log(`[bundle-sidecars] copied node-web-audio-api → ${nativeModuleDest}`)

  // node-web-audio-api is ESM with real runtime dependencies (`caller`,
  // `node-fetch`, `webidl-conversions` — plus THEIR transitive deps), and
  // its import graph loads them eagerly, so the packaged layout needs the
  // full closure next to it, not just the one package. Missing even one
  // (observed: `caller`) crashes the packaged sidecar with
  // ERR_MODULE_NOT_FOUND at import time — before it ever reads stdin.
  copyDependencyClosure(nativeModuleSrc, join(outDir, 'node_modules'), new Set())
}

/** Recursively copies `pkgDir`'s runtime `dependencies` (flat, siblings of
 * node-web-audio-api's copy — Node's walk-up resolution finds them there). */
function copyDependencyClosure(pkgDir, destModulesDir, seen) {
  const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
    if (seen.has(dep)) continue
    seen.add(dep)
    const depDir = resolvePackageDir(pkgDir, dep)
    cpSync(depDir, join(destModulesDir, dep), { recursive: true, dereference: true })
    console.log(`[bundle-sidecars] copied ${dep} → ${join(destModulesDir, dep)}`)
    copyDependencyClosure(depDir, destModulesDir, seen)
  }
}

/** Node's own resolution walk — nearest `node_modules/<name>` at or above
 * `fromDir`, realpath'd first so pnpm's virtual-store sibling layout
 * (`.pnpm/<pkg>@<v>/node_modules/<dep>`) is reachable. */
function resolvePackageDir(fromDir, name) {
  let dir = realpathSync(fromDir)
  while (true) {
    const candidate =
      basename(dir) === 'node_modules' ? join(dir, name) : join(dir, 'node_modules', name)
    if (existsSync(candidate)) return realpathSync(candidate)
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`[bundle-sidecars] cannot resolve dependency ${name} from ${fromDir}`)
    }
    dir = parent
  }
}

const codelensOnly = process.argv.includes('--codelens-only')
const audioPlayOnly = process.argv.includes('--audio-play-only')
if (codelensOnly && audioPlayOnly) {
  throw new Error('[bundle-sidecars] --codelens-only and --audio-play-only are mutually exclusive')
}

if (!audioPlayOnly) bundleCodelensService()
if (!codelensOnly) await bundleAudioPlay()
console.log('[bundle-sidecars] done')

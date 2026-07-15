import { execFileSync, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_ROOT = path.join(__dirname, '..')
const REPO_ROOT = path.join(__dirname, '..', '..', '..')
const CODELENS_SIDECAR_DIR = path.join(REPO_ROOT, 'tools', 'codelens-service', 'sidecar')
const CARGO_AVAILABLE = spawnSync('cargo', ['--version'], { stdio: 'ignore' }).status === 0

/**
 * Builds the extension (host bundle + webview bundles) before any test
 * launches VS Code. `--extensionDevelopmentPath` loads straight off
 * `dist/`, so a stale or missing build makes every webview render the
 * "not built yet" placeholder from `composeToolHtml` instead of failing
 * loudly — this step turns that into a build failure up front.
 *
 * Runs `pnpm --filter "@three-flatland/vscode..." -r run build` rather
 * than a bare `pnpm --filter … build`: the extension's own build script
 * doesn't build its `workspace:*` deps (bridge, design-system, io, image,
 * preview, schemas, three-flatland, …), which resolve to source via a
 * `"source"` package.json export condition that only tsc/vitest
 * understand — Vite/Rollup don't, so a webview build against unbuilt deps
 * fails resolving e.g. `@three-flatland/bridge/client`. The trailing
 * `...` filter suffix (pnpm's "include dependencies" selector) plus `-r`
 * builds this package's real, actual dependency closure in topological
 * order — deliberately *not* `turbo run build --filter=…`, which also
 * pulls in `@three-flatland/skia#build` (a hardcoded dependency on
 * *every* package's generic `build` task in `turbo.json`, not something
 * `@three-flatland/vscode` actually needs) and fails on machines where
 * the Zig/WASM toolchain isn't set up — a pre-existing, separately
 * tracked issue (see `.library`/memory notes on the Skia WASM build),
 * not something this harness needs to depend on or fix.
 */
export default async function globalSetup(): Promise<void> {
  // Stale-artifact hermeticity: `tools/vscode/audio-play/` and
  // `tools/vscode/bin/` are gitignored local PACKAGING output
  // (scripts/bundle-sidecars.mjs), regenerable via
  // `node scripts/bundle-sidecars.mjs`. The e2e must NEVER resolve them:
  // a frozen audio-play bundle silently diverged from the client's wire
  // protocol once (2026-07-15 — the ExtensionMode.Test resolution gap;
  // the pre-id-echo bundle answered no correlated stats request, every
  // getStats hit its 10s bound, 25/25 tests failed deterministically).
  // The managers' `!== Production` dev-first ordering routes around
  // stale artifacts; deleting them here makes the harness hermetic even
  // if that logic ever regresses.
  console.log('[e2e] removing local packaging artifacts (audio-play/, bin/) …')
  rmSync(path.join(EXTENSION_ROOT, 'audio-play'), { recursive: true, force: true })
  rmSync(path.join(EXTENSION_ROOT, 'bin'), { recursive: true, force: true })

  console.log('[e2e] pnpm --filter "@three-flatland/vscode..." -r run build …')
  execFileSync('pnpm', ['--filter', '@three-flatland/vscode...', '-r', 'run', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })

  // The zzfx CodeLens specs (e2e/specs/zzfx.spec.ts) exercise the real
  // codelens-service Rust sidecar through the real extension host, not a
  // fake/fixture binary. `sidecarManager.ts` degrades gracefully (no
  // CodeLenses, no crash) when the binary isn't found, so without this
  // step a clean checkout wouldn't fail loudly — those specs would just
  // silently assert against zero lenses / "sidecar unavailable" instead
  // of real behavior. Same pattern as
  // tools/codelens-service/src/realSidecar.test.ts's own beforeAll: build
  // fresh rather than hope a prior build is lying around, warn-and-skip
  // (not fail) if cargo isn't on PATH at all — this harness doesn't own
  // the Rust toolchain requirement, and per e2e/README.md's "CI posture"
  // this suite isn't CI-wired yet regardless.
  if (CARGO_AVAILABLE) {
    console.log('[e2e] cargo build (codelens-service sidecar) …')
    execFileSync('cargo', ['build'], { cwd: CODELENS_SIDECAR_DIR, stdio: 'inherit' })
  } else {
    console.warn(
      '[e2e] cargo not found on PATH — the zzfx CodeLens specs will run against a missing ' +
        'sidecar binary (degrades to zero lenses, not a hard failure). Install the Rust ' +
        'toolchain and re-run to exercise real sidecar behavior.'
    )
  }

  // Bundles the extension-host side of e2e/host-bridge/ (runner.ts) to a
  // plain CJS file VS Code can `require()` directly via
  // `--extensionTestsPath` — that flag loads a real file path, not a
  // package/module specifier, so it can't run TS or ESM as-is. `vscode`
  // stays external (only resolvable inside the real extension host at
  // runtime); everything else, including `ws`, is bundled in so the
  // output has no node_modules resolution dependency on where it ends up.
  console.log('[e2e] esbuild host-bridge/runner.ts …')
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'host-bridge', 'runner.ts')],
    outfile: path.join(__dirname, 'host-bridge', 'dist', 'runner.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
    logLevel: 'warning',
  })
}

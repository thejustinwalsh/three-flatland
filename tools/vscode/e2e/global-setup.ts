import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..', '..', '..')

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
  console.log('[e2e] pnpm --filter "@three-flatland/vscode..." -r run build …')
  execFileSync('pnpm', ['--filter', '@three-flatland/vscode...', '-r', 'run', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })

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

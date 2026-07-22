import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Shared vitest base for per-project configs. Each testable package has its own
 * `vitest.config.ts` that does:
 *
 *   import { mergeConfig, defineConfig } from 'vitest/config'
 *   import { baseTestConfig } from '../../vitest.base'
 *   export default mergeConfig(baseTestConfig, defineConfig({ test: { ... } }))
 *
 * This replaces the old root `vitest.config.ts` + `vitest.workspace.ts` (one
 * process, hand-maintained include/exclude, skia carved out). Per-project
 * configs let Nx run `nx affected -t test` and cache each project's tests, and
 * make skia just another project (its gl/wgpu vitest projects live in its own
 * config) instead of a special-cased `pnpm --filter` step.
 */
export const baseTestConfig = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // gltf-validator ships Dart-compiled JS that breaks under Vite's SSR
    // transform (CJS globals + navigator.userAgent at eval time) — keep external.
    server: { deps: { external: ['gltf-validator'] } },
    // Global WebGL context mock — harmless where unused, required by GPU-touching
    // tests. Absolute path so it resolves the same from any package's config.
    setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
    // CI: parallelism lives in Nx, not in each vitest. Nx runs up to 6 test
    // tasks concurrently (nx.json `parallel`) on a 4-core runner; every vitest
    // defaulting to its own core-wide worker pool oversubscribes the box to
    // ~6×4 workers + mains. A starved vitest main thread then misses the 60s
    // worker-RPC deadline and the task dies with
    // `[vitest-worker]: Timeout calling "onTaskUpdate"` — all tests green
    // (killed @three-flatland/codelens-service:test on PR #211; same class as
    // the create-three-flatland "flaky task" flags and the CI-slow timeouts
    // band-aided in 161856dc). One worker per vitest in CI keeps per-file
    // isolation (files run sequentially, fresh fork each) and ends the thrash.
    ...(process.env.CI ? { maxWorkers: 1, minWorkers: 1 } : {}),
  },
})

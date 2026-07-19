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
  },
})

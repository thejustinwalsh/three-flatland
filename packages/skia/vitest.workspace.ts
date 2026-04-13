import { defineWorkspace } from 'vitest/config'

/**
 * Run the full test suite across the WASM backends + React hook layer.
 *
 *   pnpm test          → runs gl, wgpu, and react projects
 *   pnpm test:gl       → GL only
 *   pnpm test:wgpu     → WebGPU only
 *   pnpm test:react    → React hook tests only (no WASM)
 *
 * The `gl` and `wgpu` projects load a WASM binary via SKIA_TEST_BACKEND env var
 * and run in node. The `react` project mocks WASM out entirely and runs in
 * happy-dom — it tests the React hook layer in isolation, no GPU context needed.
 */
export default defineWorkspace([
  {
    test: {
      name: 'gl',
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['src/ts/react/**'],
      setupFiles: ['./test/setup.ts'],
      env: { SKIA_TEST_BACKEND: 'gl' },
    },
  },
  {
    test: {
      name: 'wgpu',
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['src/ts/react/**'],
      setupFiles: ['./test/setup.ts'],
      env: { SKIA_TEST_BACKEND: 'wgpu' },
    },
  },
  {
    test: {
      name: 'react',
      globals: true,
      environment: 'happy-dom',
      include: ['src/ts/react/**/*.test.{ts,tsx}'],
    },
  },
])

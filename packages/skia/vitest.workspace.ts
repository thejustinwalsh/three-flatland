import { defineWorkspace } from 'vitest/config'

/**
 * Run the full test suite against both WASM backends.
 * Each project loads a different WASM binary via SKIA_TEST_BACKEND env var.
 *
 *   pnpm test          → runs both GL and WebGPU
 *   pnpm test:gl       → GL only
 *   pnpm test:wgpu     → WebGPU only
 */
export default defineWorkspace([
  {
    test: {
      name: 'gl',
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
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
      setupFiles: ['./test/setup.ts'],
      env: { SKIA_TEST_BACKEND: 'wgpu' },
    },
  },
])

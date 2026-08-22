import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const sharedSetup = fileURLToPath(new URL('../../vitest.setup.ts', import.meta.url))

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
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/ts/context.ts',
        'src/ts/paint.ts',
        'src/ts/path.ts',
        'src/ts/font.ts',
        'src/ts/image.ts',
        'src/ts/image-filter.ts',
        'src/ts/color-filter.ts',
        'src/ts/path-effect.ts',
        'src/ts/shader.ts',
        'src/ts/path-measure.ts',
        'src/ts/text-blob.ts',
        'src/ts/picture.ts',
        'src/ts/drawing-context.ts',
        'src/ts/init.ts',
        'src/ts/preload.ts',
      ],
      exclude: ['**/*.test.ts'],
    },
    projects: [
      {
        test: {
          name: 'gl',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/ts/react/**'],
          setupFiles: [sharedSetup, './test/setup.ts'],
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
          setupFiles: [sharedSetup, './test/setup.ts'],
          env: { SKIA_TEST_BACKEND: 'wgpu' },
        },
      },
      {
        test: {
          name: 'react',
          globals: true,
          environment: 'happy-dom',
          include: ['src/ts/react/**/*.test.{ts,tsx}'],
          setupFiles: [sharedSetup],
        },
      },
    ],
  },
})

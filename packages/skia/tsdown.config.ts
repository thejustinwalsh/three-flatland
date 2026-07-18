import { defineConfig } from 'tsdown'
import { cpSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Exclude both .test.ts and .test.tsx — the TSX glob would otherwise leak
  // test files (and their vitest / testing-library imports) into dist/.
  entry: [
    'src/ts/**/*.ts',
    'src/ts/**/*.tsx',
    '!src/ts/**/*.test.ts',
    '!src/ts/**/*.test-d.ts',
    '!src/ts/**/*.test.tsx',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: false, // committed WASM lives in lib/; nothing to protect in dist, but keep parity
  unbundle: true,
  fixedExtension: false,
  outDir: 'dist',
  // Mirror dist/ off src (so src/ts/index.ts -> dist/ts/index.js). Keeping the `ts/`
  // segment makes built files the SAME depth as their source, so a `new URL('../../lib/…',
  // import.meta.url)` asset ref resolves to <pkg>/lib in BOTH source (via the `source`
  // condition) and the published dist — matching @three-flatland/image's layout.
  root: 'src',
  // `/\.json$/` keeps ./wgpu-layouts.json external (referenced at runtime, copied
  // to dist below) rather than emitted as a chunk — unbundle can't name it.
  deps: { neverBundle: ['three', 'react', '@react-three/fiber', /\.json$/] },
  hooks: {
    // Copy JSON imported at runtime but not emitted by the unbundled build.
    'build:done'() {
      const src = resolve(__dirname, 'src/ts/wgpu-layouts.json')
      const dst = resolve(__dirname, 'dist/ts/wgpu-layouts.json')
      if (existsSync(src)) {
        cpSync(src, dst)
      }
    },
  },
})

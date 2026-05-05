import { defineConfig } from 'tsdown'
import { cpSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  entry: ['src/ts/**/*.ts', 'src/ts/**/*.tsx', '!src/ts/**/*.test.ts', '!src/ts/**/*.test.tsx'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: false, // WASM artifacts live in dist/ alongside TS output — don't wipe them
  unbundle: true,
  fixedExtension: false,
  root: 'src/ts',
  outDir: 'dist',
  deps: {
    neverBundle: ['three', 'react', '@react-three/fiber'],
  },
  hooks: {
    'build:done': async () => {
      // Copy JSON files that are imported at runtime but not handled by tsdown (unbundle mode)
      const src = resolve(__dirname, 'src/ts/wgpu-layouts.json')
      const dst = resolve(__dirname, 'dist/wgpu-layouts.json')
      if (existsSync(src)) {
        cpSync(src, dst)
      }
    },
  },
})

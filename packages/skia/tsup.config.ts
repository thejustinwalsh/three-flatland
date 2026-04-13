import { defineConfig } from 'tsup'
import { cpSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  entry: ['src/ts/**/*.ts', 'src/ts/**/*.tsx', '!src/ts/**/*.test.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false, // WASM artifacts live in dist/ alongside TS output — don't wipe them
  bundle: false,
  outDir: 'dist',
  esbuildOptions(options) {
    options.outbase = 'src/ts'
  },
  external: ['three', 'react', '@react-three/fiber'],
  async onSuccess() {
    // Copy JSON files that are imported at runtime but not handled by tsup (bundle: false)
    const src = resolve(__dirname, 'src/ts/wgpu-layouts.json')
    const dst = resolve(__dirname, 'dist/wgpu-layouts.json')
    if (existsSync(src)) {
      cpSync(src, dst)
    }
  },
})

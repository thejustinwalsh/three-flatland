import { defineConfig } from 'tsup'

import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineConfig({
  entry: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
    '!src/dashboard/**/*',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['tweakpane', '@tweakpane/plugin-essentials', 'react', 'vite'],
  async onSuccess() {
    // Copy vendored dashboard app for vite plugin
    await cp(
      resolve('src/dashboard'),
      resolve('dist/dashboard'),
      { recursive: true },
    )
  },
})

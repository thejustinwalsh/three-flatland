import { defineConfig } from 'tsdown'

import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.tsx', '!src/**/*.test.ts', '!src/**/*.test-d.ts', '!src/**/*.test.tsx', '!src/dashboard/**/*'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  deps: { neverBundle: ['tweakpane', '@tweakpane/plugin-essentials', 'react', 'vite'] },
  hooks: {
    // Copy vendored dashboard app for the vite plugin.
    async 'build:done'() {
      await cp(resolve('src/dashboard'), resolve('dist/dashboard'), { recursive: true })
    },
  },
})

import { defineConfig } from 'tsup'

import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineConfig({
  entry: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
    // Dashboard files are served directly as source by the vite plugin;
    // their JSX + vendored Preact aren't something tsup should compile.
    // Instead the `onSuccess` hook below copies `src/dashboard/` → `dist/
    // dashboard/` verbatim so the plugin can resolve it via the same
    // `./dashboard` path at runtime regardless of source vs. built usage.
    '!src/dashboard/**/*',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['tweakpane', '@tweakpane/plugin-essentials', 'react', 'vite'],
  async onSuccess() {
    await cp(
      resolve('src/dashboard'),
      resolve('dist/dashboard'),
      { recursive: true },
    )
  },
})

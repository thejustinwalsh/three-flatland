import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['esm'],
  dts: { entry: ['src/index.ts', 'src/vite-plugin.ts'] },
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['vite'],
  shims: true,
})

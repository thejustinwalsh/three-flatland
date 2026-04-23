import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['esm'],
  dts: { entry: ['src/index.ts', 'src/node.ts'] },
  sourcemap: true,
  clean: true,
  bundle: false,
  shims: true,
})

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['esm'],
  dts: { entry: ['src/index.ts', 'src/node.ts', 'src/cli.ts'] },
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['@three-flatland/bake', '@three-flatland/bake/node', 'pngjs', 'three'],
})

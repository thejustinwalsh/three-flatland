import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['esm', 'cjs'],
  dts: { entry: ['src/index.ts', 'src/baker.ts'] },
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['@three-flatland/bake', 'pngjs', 'three'],
})

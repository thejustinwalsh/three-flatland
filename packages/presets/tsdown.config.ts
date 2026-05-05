import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  deps: {
    neverBundle: ['three', 'three-flatland', '@three-flatland/nodes'],
  },
})

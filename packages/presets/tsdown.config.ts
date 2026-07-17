import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.test-d.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  deps: {
    neverBundle: ['three', 'three-flatland', 'three-flatland/react', '@three-flatland/nodes', '@react-three/fiber'],
  },
})

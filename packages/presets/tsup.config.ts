import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['three', 'three-flatland', 'three-flatland/react', '@three-flatland/nodes', '@react-three/fiber'],
})

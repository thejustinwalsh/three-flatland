import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    extend: 'src/extend.ts',
    resource: 'src/resource.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'three', '@react-three/fiber', '@three-flatland/core'],
})

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/ts/**/*.ts', 'src/ts/**/*.tsx', '!src/ts/**/*.test.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['three', 'react', '@react-three/fiber'],
})

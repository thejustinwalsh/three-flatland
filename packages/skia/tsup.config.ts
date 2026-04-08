import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/ts/**/*.ts', 'src/ts/**/*.tsx', '!src/ts/**/*.test.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false, // WASM artifacts live in dist/ alongside TS output — don't wipe them
  bundle: false,
  outDir: 'dist',
  esbuildOptions(options) {
    options.outbase = 'src/ts'
  },
  external: ['three', 'react', '@react-three/fiber'],
})

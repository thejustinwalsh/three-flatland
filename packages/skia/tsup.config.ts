import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/ts/index.ts', 'src/ts/three/index.ts', 'src/ts/react/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false, // WASM artifacts live in dist/ alongside TS output — don't wipe them
  bundle: false,
  external: ['three', 'react', '@react-three/fiber'],
})

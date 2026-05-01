import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/types.ts', 'src/codecs/png.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  shims: true,
})

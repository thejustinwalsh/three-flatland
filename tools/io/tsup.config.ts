import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/image.ts', 'src/atlas/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
})

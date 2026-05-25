import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/image.ts', 'src/atlas/index.ts', 'src/atlas/build.ts', 'src/atlas/types.ts', 'src/atlas/atlas.types.gen.ts', 'src/atlas/maxrects.ts', 'src/atlas/merge.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
})

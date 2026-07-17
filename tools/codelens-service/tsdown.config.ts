import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/framing.ts', 'src/protocol.ts', 'src/resolveBinary.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
})

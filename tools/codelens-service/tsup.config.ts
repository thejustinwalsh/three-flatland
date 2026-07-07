import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts', 'src/framing.ts', 'src/protocol.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
})

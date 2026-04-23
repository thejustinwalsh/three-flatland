import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/host.ts', 'src/client.ts', 'src/types.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['vscode'],
})

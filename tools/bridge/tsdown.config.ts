import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/host.ts', 'src/client.ts', 'src/types.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  deps: { neverBundle: ['vscode'] },
})

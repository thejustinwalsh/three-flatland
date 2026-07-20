import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: false,
  clean: true,
  fixedExtension: false,
  // Zero runtime dependencies: bundle the interactive-prompt deps into dist.
  deps: { alwaysBundle: ['@clack/prompts', 'picocolors'] },
})

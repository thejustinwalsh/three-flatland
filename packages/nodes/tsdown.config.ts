import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.test.tsx'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  deps: {
    neverBundle: ['three'],
  },
})

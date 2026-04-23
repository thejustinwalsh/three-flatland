import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.tsx', '!src/**/*.test.ts', '!src/**/*.test.tsx'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['react'],
})

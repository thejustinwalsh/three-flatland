import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync } from 'node:fs'

export default defineConfig({
  // Object form keeps the `atlas/` subdir in dist/ (otherwise tsup picks the
  // longest common prefix and flattens, breaking the './atlas' subpath export).
  entry: {
    'atlas/index': 'src/atlas/index.ts',
    'atlas/validator': 'src/atlas/validator.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  // bundle: false leaves the `import schema from './schema.json'` reference
  // intact in the output JS, so the JSON file must be present alongside it.
  onSuccess: async () => {
    mkdirSync('dist/atlas', { recursive: true })
    copyFileSync('src/atlas/schema.json', 'dist/atlas/schema.json')
  },
})

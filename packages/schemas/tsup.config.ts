import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Resolve the repo root so onSuccess can find the codegen script regardless
// of where tsup was invoked from (turbo runs it with cwd = packages/schemas).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

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
  onSuccess: async () => {
    // bundle: false leaves the `import schema from './schema.json'` reference
    // intact in the output JS, so the JSON file must be present alongside it.
    mkdirSync('dist/atlas', { recursive: true })
    copyFileSync('src/atlas/schema.json', 'dist/atlas/schema.json')

    // Regenerate the AtlasJson types in three-flatland + tools/io. In `dev`
    // (tsup --watch), schema edits trigger a rebuild → onSuccess → codegen,
    // and downstream tsup --watch instances pick up the new .gen.ts files.
    // In one-shot builds, turbo's //#gen:types task already ran (this is a
    // safety net, not the primary path).
    execSync('pnpm exec tsx scripts/gen-schema-types.ts', {
      cwd: repoRoot,
      stdio: 'inherit',
    })
  },
})

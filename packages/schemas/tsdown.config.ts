import { defineConfig } from 'tsdown'
import { copyFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Resolve the repo root so the build:done hook can find the codegen script
// regardless of where tsdown was invoked from (turbo runs it with cwd = packages/schemas).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  // Object entry pins the output names so the `atlas/` + `normal-descriptor/`
  // subdirs land in dist/ (so the './atlas' subpath export resolves).
  entry: {
    'atlas/index': 'src/atlas/index.ts',
    'atlas/validator': 'src/atlas/validator.ts',
    'normal-descriptor/index': 'src/normal-descriptor/index.ts',
    'normal-descriptor/validator': 'src/normal-descriptor/validator.ts',
    version: 'src/version.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  unbundle: true,
  fixedExtension: false,
  // Keep JSON imports external so the emitted JS references ./schema.json (copied
  // below) and ../package.json at runtime, instead of rolldown emitting them as
  // chunks (which breaks output-name derivation under unbundle).
  deps: { neverBundle: [/\.json$/] },
  hooks: {
    'build:done'() {
      // unbundle leaves the `import schema from './schema.json'` reference intact
      // in the output JS, so the JSON file must be present alongside it.
      mkdirSync('dist/atlas', { recursive: true })
      copyFileSync('src/atlas/schema.json', 'dist/atlas/schema.json')
      copyFileSync('src/atlas/texturepacker.schema.json', 'dist/atlas/texturepacker.schema.json')
      copyFileSync('src/atlas/aseprite.schema.json', 'dist/atlas/aseprite.schema.json')
      mkdirSync('dist/normal-descriptor', { recursive: true })
      copyFileSync('src/normal-descriptor/schema.json', 'dist/normal-descriptor/schema.json')

      // Regenerate the AtlasJson types in three-flatland + tools/io. In `dev`
      // (tsdown --watch), schema edits trigger rebuild → build:done → codegen.
      // In one-shot builds, turbo's //#gen:types task already ran (safety net).
      execSync('node scripts/gen-schema-types.ts', {
        cwd: repoRoot,
        stdio: 'inherit',
      })
    },
  },
})

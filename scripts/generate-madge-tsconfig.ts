// Generates tsconfig.madge.json — a paths map so madge can follow imports
// across workspace package boundaries (e.g. `import from '@three-flatland/presets'`
// resolves to packages/presets/src/index.ts instead of dead-ending at node_modules).
//
// Discovers workspace packages by globbing the patterns from pnpm-workspace.yaml
// (packages/*, minis/*, tools/*) and reads each package.json's `exports` field,
// preferring the `source` condition.

import fg from 'fast-glob'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, posix } from 'node:path'

const PKG_GLOBS = [
  'packages/*/package.json',
  'minis/*/package.json',
  'tools/*/package.json',
]

type Exports = string | { source?: string; [k: string]: unknown } | { [k: string]: unknown }

const pkgFiles = fg.sync(PKG_GLOBS, { cwd: process.cwd() }).sort()
const paths: Record<string, string[]> = {}

const stripDotSlash = (s: string) => s.replace(/^\.\//, '')
const stripTsExt = (s: string) => s.replace(/\.tsx?$/, '')

for (const pkgFile of pkgFiles) {
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  if (!pkg.name) continue
  const dir = dirname(pkgFile)

  const addEntry = (subpath: string, source: string) => {
    const sub = subpath === '.' ? '' : subpath.replace(/^\./, '')
    const key = pkg.name + sub
    const target = posix.join(dir, stripDotSlash(source))
    paths[key] = [key.includes('*') ? stripTsExt(target) : target]
  }

  const exportsField = pkg.exports as Exports | undefined
  if (exportsField && typeof exportsField === 'object') {
    for (const [subpath, value] of Object.entries(exportsField)) {
      const source =
        typeof value === 'string' ? value : (value as { source?: string })?.source
      if (typeof source === 'string') addEntry(subpath, source)
    }
  } else {
    // Fallback: assume src/index.ts
    addEntry('.', './src/index.ts')
    addEntry('./*', './src/*')
  }
}

const sorted = Object.fromEntries(
  Object.entries(paths).sort(([a], [b]) => a.localeCompare(b)),
)

const tsconfig = {
  extends: './tsconfig.base.json',
  compilerOptions: {
    baseUrl: '.',
    paths: sorted,
  },
}

writeFileSync('tsconfig.madge.json', JSON.stringify(tsconfig, null, 2) + '\n')
console.log(
  `tsconfig.madge.json: ${Object.keys(sorted).length} path entries from ${pkgFiles.length} packages`,
)

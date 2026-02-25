/**
 * Keeps react subpath wrapper files in sync with core categories.
 *
 * Each public category (e.g., sprites, animation) gets a thin wrapper at
 * `src/react/{name}.ts` that imports the ThreeElements type augmentation
 * and re-exports the core category. This enables tree-shakeable imports
 * like `three-flatland/react/sprites`.
 *
 * Usage:
 *   tsx scripts/sync-react-subpaths.ts           # Generate/delete + git add
 *   tsx scripts/sync-react-subpaths.ts --verify  # CI check, exit 1 if out of sync
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PKG_SRC = join(ROOT, 'packages', 'three-flatland', 'src')
const REACT_DIR = join(PKG_SRC, 'react')

const WRAPPER_TEMPLATE = (name: string) => `import './types'\nexport * from '../${name}'\n`

// Match the exact generated pattern: import './types' + export * from '../{name}'
const GENERATED_RE = /^import '\.\/types'\nexport \* from '\.\.\/([^']+)'\n$/

function getExpectedCategories(): string[] {
  const indexPath = join(PKG_SRC, 'index.ts')
  const content = readFileSync(indexPath, 'utf-8')
  const categories: string[] = []

  for (const line of content.split('\n')) {
    const match = line.match(/^export \* from '\.\/([^']+)'$/)
    if (!match) continue

    const name = match[1]
    if (name === 'react') continue

    // Only include directories with an index.ts (skip standalone files like Flatland.ts)
    const indexFile = join(PKG_SRC, name, 'index.ts')
    if (existsSync(indexFile)) {
      categories.push(name)
    }
  }

  return categories
}

function getExistingGenerated(): Map<string, string> {
  const generated = new Map<string, string>()

  for (const entry of readdirSync(REACT_DIR)) {
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue

    const filePath = join(REACT_DIR, entry)
    const content = readFileSync(filePath, 'utf-8')
    const match = content.match(GENERATED_RE)

    if (match) {
      const name = entry.replace(/\.ts$/, '')
      generated.set(name, filePath)
    }
  }

  return generated
}

// Main
const verify = process.argv.includes('--verify')

const expected = new Set(getExpectedCategories())
const existing = getExistingGenerated()

const missing: string[] = []
const stale: string[] = []

// Find missing wrappers
for (const name of expected) {
  if (!existing.has(name)) {
    missing.push(name)
  }
}

// Find stale wrappers (generated files whose category no longer exists)
for (const [name, filePath] of existing) {
  if (!expected.has(name)) {
    stale.push(name)
  }
}

if (missing.length === 0 && stale.length === 0) {
  if (verify) {
    console.log('React subpath wrappers are in sync.')
  }
  process.exit(0)
}

if (verify) {
  console.error('React subpath wrappers are out of sync!\n')

  for (const name of missing) {
    console.error(`  Missing: src/react/${name}.ts`)
  }
  for (const name of stale) {
    console.error(`  Stale:   src/react/${name}.ts`)
  }

  console.error(
    `\nRun 'pnpm sync:react' locally or install git hooks with 'pnpm prepare'.`,
  )
  process.exit(1)
}

// Generate missing wrappers
const createdPaths: string[] = []

for (const name of missing) {
  const filePath = join(REACT_DIR, `${name}.ts`)
  writeFileSync(filePath, WRAPPER_TEMPLATE(name))
  createdPaths.push(filePath)
  console.log(`  Created: src/react/${name}.ts`)
}

// Delete stale wrappers
const deletedPaths: string[] = []

for (const name of stale) {
  const filePath = existing.get(name)!
  unlinkSync(filePath)
  deletedPaths.push(filePath)
  console.log(`  Deleted: src/react/${name}.ts`)
}

// Stage changes
const toRelative = (p: string) => p.replace(ROOT + '/', '')

if (createdPaths.length > 0) {
  execSync(`git add ${createdPaths.map(toRelative).join(' ')}`, { cwd: ROOT })
}

if (deletedPaths.length > 0) {
  const relativePaths = deletedPaths.map(toRelative).join(' ')
  // Use git rm --cached --ignore-unmatch for deletions — handles both tracked and untracked files
  execSync(`git rm --cached --ignore-unmatch ${relativePaths}`, { cwd: ROOT, stdio: 'pipe' })
}

const total = createdPaths.length + deletedPaths.length
console.log(`\nSynced ${total} react subpath wrapper(s).`)

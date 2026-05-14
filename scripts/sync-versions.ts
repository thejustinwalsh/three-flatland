// Syncs `export const VERSION` in each packages/<name>/src/index.ts to match
// the package's package.json version. Wired into `changeset:version` so
// source-level version constants don't drift from the published version.
//
// Usage:
//   tsx scripts/sync-versions.ts            # Write updates
//   tsx scripts/sync-versions.ts --verify   # CI check, exit 1 if drift

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGES_DIR = join(ROOT, 'packages')
const VERSION_RE = /(export\s+const\s+VERSION\s*=\s*)(['"])([^'"]*)\2/

interface Result {
  pkg: string
  file: string
  current: string
  expected: string
  needsUpdate: boolean
}

function scanPackage(name: string): Result | null {
  const pkgPath = join(PACKAGES_DIR, name, 'package.json')
  const indexPath = join(PACKAGES_DIR, name, 'src', 'index.ts')
  if (!existsSync(pkgPath) || !existsSync(indexPath)) return null

  const expected: string = JSON.parse(readFileSync(pkgPath, 'utf-8')).version
  const content = readFileSync(indexPath, 'utf-8')
  const match = content.match(VERSION_RE)
  if (!match) return null

  const current = match[3]
  return {
    pkg: name,
    file: indexPath,
    current,
    expected,
    needsUpdate: current !== expected,
  }
}

function writeUpdate(r: Result): void {
  const content = readFileSync(r.file, 'utf-8')
  const updated = content.replace(VERSION_RE, (_, prefix, quote) => `${prefix}${quote}${r.expected}${quote}`)
  writeFileSync(r.file, updated)
}

const args = process.argv.slice(2)
const verify = args.includes('--verify')

const packages = readdirSync(PACKAGES_DIR).filter((name) => {
  const stat = existsSync(join(PACKAGES_DIR, name, 'package.json'))
  return stat
})

const results: Result[] = []
for (const name of packages) {
  const r = scanPackage(name)
  if (r) results.push(r)
}

const drift = results.filter((r) => r.needsUpdate)

if (verify) {
  if (drift.length > 0) {
    console.error('VERSION drift detected — run `pnpm sync:versions` to fix:')
    for (const r of drift) console.error(`  ${r.pkg}: src says '${r.current}', package.json says '${r.expected}'`)
    process.exit(1)
  }
  console.log(`sync-versions: ${results.length} package(s) checked, all in sync`)
  process.exit(0)
}

if (drift.length === 0) {
  console.log(`sync-versions: ${results.length} package(s) checked, all in sync`)
  process.exit(0)
}

for (const r of drift) {
  writeUpdate(r)
  console.log(`  ${r.pkg}: '${r.current}' → '${r.expected}'`)
}
console.log(`sync-versions: synced ${drift.length} package(s)`)

/**
 * Syncs package.json files so they use real npm version strings
 * instead of `catalog:` and `workspace:*`. This makes packages copy-paste-able
 * outside the monorepo.
 *
 * Usage: pnpm sync-pack <dir> [<dir> ...]
 *   e.g. pnpm sync-pack examples minis
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// Parse pnpm-workspace.yaml catalog (simple YAML parser for flat key-value)
function parseCatalog(): Record<string, string> {
  const content = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf-8')
  const catalog: Record<string, string> = {}
  let inCatalog = false

  for (const line of content.split('\n')) {
    if (line.startsWith('catalog:')) {
      inCatalog = true
      continue
    }
    if (inCatalog && /^\S/.test(line) && !line.startsWith('#')) {
      break
    }
    if (!inCatalog) continue

    // Match: "  package-name: ^version" or '  "@scoped/name": ^version'
    const match = line.match(/^\s+(?:"([^"]+)"|(\S+)):\s*(.+)$/)
    if (match) {
      const name = match[1] || match[2]
      const version = match[3].trim()
      if (!version.startsWith('#') && name) {
        catalog[name] = version
      }
    }
  }

  return catalog
}

// Get internal package versions from packages/*/package.json
function getInternalVersions(): Record<string, string> {
  const versions: Record<string, string> = {}
  const packagesDir = join(ROOT, 'packages')

  for (const dir of readdirSync(packagesDir)) {
    const pkgPath = join(packagesDir, dir, 'package.json')
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg.name) {
        versions[pkg.name] = pkg.version || '0.0.0'
      }
    } catch {
      // Skip if package.json doesn't exist
    }
  }

  return versions
}

// Find all package.json files under a directory
function findPackages(dir: string): string[] {
  const results: string[] = []

  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (entry === 'node_modules') continue
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (entry === 'package.json') {
        results.push(full)
      }
    }
  }

  walk(dir)
  return results
}

// Replace version strings in a deps object
function syncDeps(
  deps: Record<string, string> | undefined,
  catalog: Record<string, string>,
  internal: Record<string, string>,
): boolean {
  if (!deps) return false
  let changed = false

  for (const [name, version] of Object.entries(deps)) {
    if (version === 'catalog:') {
      if (catalog[name]) {
        deps[name] = catalog[name]
        changed = true
      } else {
        console.warn(`  ⚠ No catalog entry for "${name}"`)
      }
    } else if (version === 'workspace:*') {
      if (internal[name]) {
        deps[name] = `^${internal[name]}`
        changed = true
      } else {
        console.warn(`  ⚠ No internal package for "${name}"`)
      }
    }
  }

  return changed
}

// Main
const dirs = process.argv.slice(2)

if (dirs.length === 0) {
  console.error('Usage: pnpm sync-pack <dir> [<dir> ...]')
  process.exit(1)
}

const catalog = parseCatalog()
const internal = getInternalVersions()

console.log('Catalog versions:', catalog)
console.log('Internal versions:', internal)
console.log()

let totalChanged = 0

for (const dir of dirs) {
  const absDir = resolve(ROOT, dir)

  if (!existsSync(absDir)) {
    console.warn(`⚠ Directory not found: ${dir}`)
    continue
  }

  console.log(`Scanning ${dir}/`)
  const packages = findPackages(absDir)

  for (const pkgPath of packages) {
    const content = readFileSync(pkgPath, 'utf-8')
    const pkg = JSON.parse(content)
    const relative = pkgPath.replace(ROOT + '/', '')

    const depsChanged = syncDeps(pkg.dependencies, catalog, internal)
    const devDepsChanged = syncDeps(pkg.devDependencies, catalog, internal)

    if (depsChanged || devDepsChanged) {
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
      console.log(`  ✓ Updated ${relative}`)
      totalChanged++
    } else {
      console.log(`    (no changes) ${relative}`)
    }
  }
}

console.log(`\nDone. Updated ${totalChanged} package.json files.`)

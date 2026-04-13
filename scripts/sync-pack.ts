/**
 * Syncs package.json files so they use real npm version strings
 * instead of `catalog:` and `workspace:*`. This makes packages copy-paste-able
 * outside the monorepo.
 *
 * Usage: pnpm sync:pack <dir> [<dir> ...]
 *   e.g. pnpm sync:pack examples minis
 *
 * Flags:
 *   --files <file> ...   Process individual files (used by lefthook)
 *   --verify             CI check, exit 1 if any files are out of sync
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')

// Parse pnpm-workspace.yaml catalog (simple YAML parser for flat key-value)
export function parseCatalog(): Record<string, string> {
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

    // Match: "  package-name: ^version" or '  "@scoped/name": ^version' or "  '@scoped/name': ^version"
    const match = line.match(/^\s+(?:"([^"]+)"|'([^']+)'|(\S+)):\s*(.+)$/)
    if (match) {
      const name = match[1] || match[2] || match[3]
      const version = match[4].trim()
      if (!version.startsWith('#') && name) {
        catalog[name] = version
      }
    }
  }

  return catalog
}

// Get internal package versions from packages/*/package.json
export function getInternalVersions(): Record<string, string> {
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

// Build a unified {name → version} lookup from the catalog and internal
// workspace packages. Catalog values pass through verbatim (they already
// include a range prefix like ^). Internal workspace versions get ^ prepended.
// Internal wins on collision.
export function buildVersionTable(
  catalog: Record<string, string>,
  internal: Record<string, string>,
): Record<string, string> {
  const table: Record<string, string> = { ...catalog }
  for (const [name, version] of Object.entries(internal)) {
    table[name] = `^${version}`
  }
  return table
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

// Overwrite any dep whose name is in the version table with the table value.
// Deps not in the table are left untouched. Returns true iff at least one
// value changed.
export function syncDeps(
  deps: Record<string, string> | undefined,
  table: Record<string, string>,
): boolean {
  if (!deps) return false
  let changed = false

  for (const [name, current] of Object.entries(deps)) {
    const target = table[name]
    if (target !== undefined && current !== target) {
      deps[name] = target
      changed = true
    }
  }

  return changed
}

// Check for drift: for each dep whose name is in the table, report a human
// readable string when the current value differs from the table value.
// Returns an empty array on a clean tree. Out-of-table deps are ignored.
export function checkDeps(
  deps: Record<string, string> | undefined,
  table: Record<string, string>,
): string[] {
  if (!deps) return []
  const issues: string[] = []

  for (const [name, current] of Object.entries(deps)) {
    const target = table[name]
    if (target !== undefined && current !== target) {
      issues.push(`  "${name}": expected "${target}", got "${current}"`)
    }
  }

  return issues
}

// Only run CLI when invoked directly, not when imported by tests
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Main
  const args = process.argv.slice(2)
  const fileMode = args[0] === '--files'
  const verifyMode = args[0] === '--verify'

  if (args.length === 0) {
    console.error(
      'Usage: pnpm sync:pack <dir> [<dir> ...]\n' +
        '       pnpm sync:pack --files <file> [<file> ...]\n' +
        '       pnpm sync:pack --verify <dir> [<dir> ...]',
    )
    process.exit(1)
  }

  const catalog = parseCatalog()
  const internal = getInternalVersions()

  if (verifyMode) {
    // Verify mode: report drift between example/mini pins and the catalog + internal packages (used by CI)
    const table = buildVersionTable(catalog, internal)
    const dirs = args.slice(1)
    if (dirs.length === 0) {
      console.error('Usage: pnpm sync:pack --verify <dir> [<dir> ...]')
      process.exit(1)
    }

    let totalOutOfSync = 0

    for (const dir of dirs) {
      const absDir = resolve(ROOT, dir)
      if (!existsSync(absDir)) {
        console.warn(`⚠ Directory not found: ${dir}`)
        continue
      }

      const packages = findPackages(absDir)

      for (const pkgPath of packages) {
        const content = readFileSync(pkgPath, 'utf-8')
        const pkg = JSON.parse(content)
        const relative = pkgPath.replace(ROOT + '/', '')

        const depsIssues = checkDeps(pkg.dependencies, table)
        const devDepsIssues = checkDeps(pkg.devDependencies, table)
        const peerDepsIssues = checkDeps(pkg.peerDependencies, table)
        const allIssues = [...depsIssues, ...devDepsIssues, ...peerDepsIssues]

        if (allIssues.length > 0) {
          console.error(`${relative}:`)
          for (const issue of allIssues) {
            console.error(issue)
          }
          totalOutOfSync++
        }
      }
    }

    if (totalOutOfSync > 0) {
      console.error(
        `\n${totalOutOfSync} package(s) have unresolved versions.` +
          `\nRun 'pnpm sync:pack ${dirs.join(' ')}' locally or install git hooks with 'pnpm prepare'.`,
      )
      process.exit(1)
    }

    console.log('Package versions are in sync.')
  } else if (fileMode) {
    // File mode: process individual package.json files (used by lefthook)
    const files = args.slice(1)
    let totalChanged = 0
    const table = buildVersionTable(catalog, internal)

    for (const file of files) {
      const absPath = resolve(ROOT, file)
      if (!existsSync(absPath)) {
        console.error(`Error: File not found: ${file}`)
        process.exit(1)
      }

      const content = readFileSync(absPath, 'utf-8')
      const pkg = JSON.parse(content)

      const depsChanged = syncDeps(pkg.dependencies, table)
      const devDepsChanged = syncDeps(pkg.devDependencies, table)
      const peerDepsChanged = syncDeps(pkg.peerDependencies, table)

      if (depsChanged || devDepsChanged || peerDepsChanged) {
        writeFileSync(absPath, JSON.stringify(pkg, null, 2) + '\n')
        totalChanged++
      }
    }

    if (totalChanged > 0) {
      console.error(`Synced ${totalChanged} package.json file(s)`)
    }
  } else {
    // Directory mode: walk directories (existing behavior)
    const table = buildVersionTable(catalog, internal)
    console.log('Version table:', table)
    console.log()

    let totalChanged = 0

    for (const dir of args) {
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

        const depsChanged = syncDeps(pkg.dependencies, table)
        const devDepsChanged = syncDeps(pkg.devDependencies, table)
        const peerDepsChanged = syncDeps(pkg.peerDependencies, table)

        if (depsChanged || devDepsChanged || peerDepsChanged) {
          writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
          console.log(`  ✓ Updated ${relative}`)
          totalChanged++
        } else {
          console.log(`    (no changes) ${relative}`)
        }
      }
    }

    console.log(`\nDone. Updated ${totalChanged} package.json files.`)
  }
}

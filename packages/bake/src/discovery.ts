import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { BakerRegistration, FlatlandManifest } from './types.js'

interface PackageJson {
  name?: string
  flatland?: FlatlandManifest
}

/**
 * Discover registered bakers by walking `node_modules` near the current
 * working directory. Supports both flat and pnpm-symlinked layouts: every
 * `package.json` that declares a `flatland.bakers` field is picked up.
 *
 * Conflicts (multiple packages registering the same baker name) are reported;
 * the first match wins and the rest are returned as warnings so the caller
 * can decide whether to fail or log.
 */
export function discoverBakers(cwd: string = process.cwd()): {
  bakers: BakerRegistration[]
  conflicts: string[]
} {
  const seenPackages = new Set<string>()
  const bakers = new Map<string, BakerRegistration>()
  const conflicts: string[] = []

  for (const nodeModulesDir of findNodeModulesDirs(cwd)) {
    scanNodeModules(nodeModulesDir, bakers, conflicts, seenPackages)
  }

  return { bakers: Array.from(bakers.values()), conflicts }
}

/** Walk upward from `cwd` collecting each `node_modules` directory we find. */
function findNodeModulesDirs(cwd: string): string[] {
  const dirs: string[] = []
  let dir = resolve(cwd)
  while (true) {
    const nm = join(dir, 'node_modules')
    if (existsSync(nm) && statSync(nm).isDirectory()) {
      dirs.push(nm)
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return dirs
}

function scanNodeModules(
  nodeModulesDir: string,
  bakers: Map<string, BakerRegistration>,
  conflicts: string[],
  seenPackages: Set<string>
): void {
  let entries: string[]
  try {
    entries = readdirSync(nodeModulesDir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const entryPath = join(nodeModulesDir, entry)

    if (entry.startsWith('@')) {
      // Scoped packages: @scope/name
      let scoped: string[]
      try {
        scoped = readdirSync(entryPath)
      } catch {
        continue
      }
      for (const scopedName of scoped) {
        readPackage(join(entryPath, scopedName), bakers, conflicts, seenPackages)
      }
    } else {
      readPackage(entryPath, bakers, conflicts, seenPackages)
    }
  }
}

function readPackage(
  packageDir: string,
  bakers: Map<string, BakerRegistration>,
  conflicts: string[],
  seenPackages: Set<string>
): void {
  const pkgPath = join(packageDir, 'package.json')
  if (!existsSync(pkgPath)) return

  let pkg: PackageJson
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson
  } catch {
    return
  }

  const name = pkg.name ?? packageDir
  if (seenPackages.has(name)) return
  seenPackages.add(name)

  const manifest = pkg.flatland?.bakers
  if (!manifest || manifest.length === 0) return

  for (const decl of manifest) {
    const resolvedEntry = resolve(packageDir, decl.entry)
    const registration: BakerRegistration = {
      name: decl.name,
      description: decl.description,
      entry: decl.entry,
      packageName: name,
      resolvedEntry,
    }

    const existing = bakers.get(decl.name)
    if (existing) {
      conflicts.push(
        `baker "${decl.name}" is registered by both "${existing.packageName}" and "${name}" — using "${existing.packageName}"`
      )
      continue
    }
    bakers.set(decl.name, registration)
  }
}

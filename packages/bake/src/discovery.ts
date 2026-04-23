import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type {
  BakerRegistration,
  FlatlandManifest,
  FlatlandManifestEntry,
} from './types.js'

interface PackageJson {
  name?: string
  flatland?: FlatlandManifest
}

/**
 * Discover registered bakers by walking `node_modules` near the current
 * working directory. Supports both flat and pnpm-symlinked layouts: every
 * `package.json` that declares a `flatland.bake` (or legacy
 * `flatland.bakers`) field is picked up.
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

  // CWD-package self-discovery: if the user is iterating inside a package
  // that declares a baker, let them invoke it without symlinking into
  // node_modules first. Registers the baker before node_modules scans so a
  // local version always wins against an older installed copy.
  const selfDir = findPackageRoot(cwd)
  if (selfDir) {
    readPackage(selfDir, bakers, conflicts, seenPackages)
  }

  for (const nodeModulesDir of findNodeModulesDirs(cwd)) {
    scanNodeModules(nodeModulesDir, bakers, conflicts, seenPackages)
  }

  return { bakers: Array.from(bakers.values()), conflicts }
}

/** Walk upward from `start` until a directory with package.json is found. */
function findPackageRoot(start: string): string | null {
  let dir = resolve(start)
  while (true) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) return null
    dir = parent
  }
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

  const manifest = resolveManifest(pkg.flatland, name, conflicts)
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

/**
 * Prefer `flatland.bake` (current); fall back to `flatland.bakers`
 * (legacy) with a one-time deprecation warning per package.
 */
function resolveManifest(
  manifest: FlatlandManifest | undefined,
  packageName: string,
  conflicts: string[]
): FlatlandManifestEntry[] | undefined {
  if (!manifest) return undefined
  if (manifest.bake && manifest.bake.length > 0) return manifest.bake
  if (manifest.bakers && manifest.bakers.length > 0) {
    conflicts.push(
      `"${packageName}" uses deprecated \`flatland.bakers\` — rename to \`flatland.bake\` (the legacy key is accepted for one release)`
    )
    return manifest.bakers
  }
  return undefined
}

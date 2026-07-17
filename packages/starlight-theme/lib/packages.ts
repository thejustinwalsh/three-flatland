/**
 * Workspace package discovery — single source of truth for surfacing
 * package state (name, version, badge) across the site.
 *
 * Reads `packages/* /package.json` at build time. Each package's
 * `flatland.badge` field opts that package into a badge ("preview",
 * "alpha", etc.). Absent = no badge. Private packages are excluded.
 *
 * Used by:
 *   - SiteFooter (Packages column + version row)
 *   - PageFrame's alpha-ribbon (project-level badge from the brand pkg)
 *   - Future: sidebar / page-title / heading badges keyed by package
 *
 * "One location to rule them all": when a package goes stable, drop
 * its `flatland.badge` and every surface updates on next build.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

export interface DetectedPackage {
  name: string
  version: string
  /** Opt-in badge from `flatland.badge` in the package's package.json. */
  badge?: string
}

/**
 * Find the pnpm workspace root by walking up from `process.cwd()`
 * looking for `pnpm-workspace.yaml`. Returns undefined if not found.
 *
 * `process.cwd()` is stable across Astro/Vite SSR builds, unlike
 * `import.meta.url` which lands in a bundled-output location.
 */
function findWorkspaceRoot(): string | undefined {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return undefined
}

interface RawPackageJson {
  name?: string
  version?: string
  private?: boolean
  flatland?: { badge?: string }
}

function readAllPackages(): DetectedPackage[] {
  try {
    const root = findWorkspaceRoot()
    if (!root) return []
    const packagesDir = resolve(root, 'packages')
    if (!existsSync(packagesDir)) return []
    const entries: DetectedPackage[] = []
    for (const entry of readdirSync(packagesDir)) {
      const pkgPath = resolve(packagesDir, entry, 'package.json')
      if (!existsSync(pkgPath)) continue
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as RawPackageJson
        if (typeof pkg.name !== 'string') continue
        if (pkg.private === true) continue
        const badge = pkg.flatland?.badge
        entries.push({
          name: pkg.name,
          version: pkg.version ?? '0.0.0',
          badge: typeof badge === 'string' && badge.length > 0 ? badge : undefined,
        })
      } catch {
        continue
      }
    }
    return entries.sort((a, b) => {
      // Bare brand package first, then alphabetical inside @scope.
      const aScoped = a.name.startsWith('@')
      const bScoped = b.name.startsWith('@')
      if (!aScoped && bScoped) return -1
      if (aScoped && !bScoped) return 1
      return a.name.localeCompare(b.name)
    })
  } catch {
    return []
  }
}

/**
 * All public workspace packages, evaluated once at module load.
 * Astro components that import this module share the same snapshot
 * for the duration of the build.
 */
export const workspacePackages: DetectedPackage[] = readAllPackages()

export function findPackage(name: string): DetectedPackage | undefined {
  return workspacePackages.find((pkg) => pkg.name === name)
}

export function getPackageBadge(name: string): string | undefined {
  return findPackage(name)?.badge
}

export function getPackageVersion(name: string): string | undefined {
  return findPackage(name)?.version
}

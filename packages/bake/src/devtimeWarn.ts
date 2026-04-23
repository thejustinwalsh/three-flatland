const _warned = new Map<string, Set<string>>()

/**
 * Emit a console warning gated on `NODE_ENV !== 'production'`. Deduped
 * per `(category, url)` — the same warning never fires twice.
 *
 * Shared by every sidecar-using loader so warnings surface uniformly
 * across the ecosystem (normals, fonts, atlases, …).
 *
 * @param category short tag identifying what system warned (e.g. 'normal')
 * @param url      absolute URL or path of the asset
 * @param message  the message shown to the user
 */
export function devtimeWarn(category: string, url: string, message: string): void {
  if (isProduction()) return
  let set = _warned.get(category)
  if (!set) {
    set = new Set()
    _warned.set(category, set)
  }
  if (set.has(url)) return
  set.add(url)
  console.warn(`[${category}] ${message}`)
}

/** Clear the devtime-warning dedupe cache. Intended for tests. */
export function _resetDevtimeWarnings(): void {
  _warned.clear()
}

/**
 * Type-agnostic NODE_ENV check. Reads `globalThis.process.env.NODE_ENV`
 * without forcing consumers to depend on `@types/node` — browser-only
 * packages (e.g. mini-breakout, example apps) inline-consume this
 * module through the source export and would otherwise hit TS2591.
 */
function isProduction(): boolean {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return proc?.env?.['NODE_ENV'] === 'production'
}

/**
 * Duplicate-module guard for the a11y system's cross-module state.
 *
 * Module-scoped registries (`WeakMap`/`Set`/`signal`) silently FORK when two copies of this module
 * load — a workspace version skew, a split bundle, an app + plugin resolving `@three-flatland/uikit`
 * to different files. Then a backend registered through copy A's `registerAnnouncementBackend` never
 * fires on copy B's `announce`, or projection on copy B enumerates none of copy A's members. Stashing
 * each registry on `globalThis` under a stable `Symbol.for` key makes every copy resolve to the SAME
 * instance, so the state can't fork.
 *
 * Within a single consistent import graph there is exactly one copy and this is an ordinary lazy init
 * — the guard only does work when several copies coexist.
 */
export function a11yGlobal<T>(key: string, create: () => T): T {
  const registry = globalThis as unknown as Record<symbol, unknown>
  const sym = Symbol.for(`@three-flatland/uikit:a11y:${key}`)
  if (!(sym in registry)) {
    registry[sym] = create()
  }
  return registry[sym] as T
}

// Pure memoization primitive for `service.ts`'s cache-file load — split
// out so it's unit-testable without the `vscode` module `service.ts`
// imports at module scope (same pattern as `resolveParams.ts`'s
// `numberArrayLiteral.ts` split and `toolRegistry.ts`'s
// `toolRegistryDecisions.ts` split).

/**
 * Lazily loads a value via `load()` once, caching the result. Two
 * concurrent `get()` calls while the value is still cold share the SAME
 * in-flight `load()` call — the second caller awaits the first's
 * promise instead of triggering its own independent `load()`, which
 * would otherwise let the second call's (redundant) resolution clobber
 * whatever the first call's caller already did to the cached value in
 * the gap between the two `load()`s resolving.
 */
export function createMemoizedLoader<T>(load: () => Promise<T>): {
  /** Resolves to the cached value, loading it first if cold. */
  get(): Promise<T>
  /** The cached value if already loaded, `undefined` if still cold. */
  peek(): T | undefined
  /** Overwrites the cached value directly — for a caller (like a
   * read-merge-write cache setter) that computes its own next value
   * rather than going through `load()` again. */
  set(value: T): void
} {
  let cached: T | undefined
  let inFlight: Promise<T> | null = null
  return {
    async get() {
      if (cached !== undefined) return cached
      inFlight ??= load().then((value) => {
        cached = value
        inFlight = null
        return value
      })
      return inFlight
    },
    peek() {
      return cached
    },
    set(value: T) {
      cached = value
    },
  }
}

/**
 * Shallow object/array equality.
 *
 * Used by `useTrait` selectors and other places that need to skip
 * referentially-equal updates. Mirrors the helper in minis/breakout.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (Reflect.get(a, k) !== Reflect.get(b, k)) {
      return false
    }
  }
  return true
}
